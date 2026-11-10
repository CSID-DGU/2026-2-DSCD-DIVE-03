import subprocess
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from ml.brand.profiles import ProfileStore, canonical_url

KEYS=['spirited','trustworthy','upscale','stylish','well-organized','friendly','sentimental']
def sample():return {'description':'공식 근거 기반 설명','trait_scores':dict.fromkeys(KEYS,.5)}

class ProfilesTests(unittest.TestCase):
 def test_identity(self):
  self.assertEqual(canonical_url('HTTPS://Example.COM:443?utm_source=x#top'),'https://example.com/')
  self.assertNotEqual(canonical_url('https://example.com/kr'),canonical_url('https://example.com/us'))
  self.assertNotEqual(canonical_url('https://example.com/?lang=ko'),canonical_url('https://example.com/?lang=en'))
  self.assertNotEqual(canonical_url('https://www.example.com/'),canonical_url('https://example.com/'))
  self.assertNotEqual(canonical_url('http://example.com/'),canonical_url('https://example.com/'))
 def test_restart_version_and_explicit_refresh(self):
  with tempfile.TemporaryDirectory() as d:
   a=ProfileStore(d).get('https://example.com/','v1',sample)
   b=ProfileStore(d).get('https://example.com/?utm_source=x','v1',lambda:self.fail('recomputed'))
   self.assertEqual(a['profile_id'],b['profile_id'])
   c=ProfileStore(d).get('https://example.com/','v2',sample)
   self.assertNotEqual(a['profile_id'],c['profile_id'])
   e=ProfileStore(d).get('https://example.com/','v1',sample,refresh=True)
   self.assertNotEqual(a['profile_id'],e['profile_id'])
 def test_concurrent_same_brand_computed_once(self):
  with tempfile.TemporaryDirectory() as d:
   calls=[]
   def create():calls.append(1);time.sleep(.04);return sample()
   with ThreadPoolExecutor(max_workers=4) as pool:
    rows=list(pool.map(lambda _:ProfileStore(d).get('https://example.com/','v1',create),range(4)))
   self.assertEqual(len(calls),1)
   self.assertEqual(len({r['profile_id'] for r in rows}),1)
 def test_failed_or_invalid_profile_not_saved(self):
  with tempfile.TemporaryDirectory() as d:
   store=ProfileStore(d)
   with self.assertRaises(RuntimeError):store.get('https://example.com/','v1',lambda:(_ for _ in ()).throw(RuntimeError('failed')))
   with self.assertRaises(ValueError):store.get('https://example.com/','v1',lambda:{'description':'x','trait_scores':{}})
   self.assertIn('profile_id',store.get('https://example.com/','v1',sample))

 def test_new_process_reuses_persisted_profile(self):
  with tempfile.TemporaryDirectory() as d:
   first=ProfileStore(d).get('https://example.com/','v1',sample)
   code="from ml.brand.profiles import ProfileStore; import sys; r=ProfileStore(sys.argv[1]).get('https://example.com/','v1',lambda:None); print(r['profile_id'])"
   result=subprocess.run([sys.executable,'-c',code,d],capture_output=True,text=True,check=True)
   self.assertEqual(result.stdout.strip(),first['profile_id'])

 def test_json_format_and_atomic_failure_preserves_previous(self):
  import json
  from pathlib import Path
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as d:
   store=ProfileStore(d)
   first=store.get('https://example.com/','v1',sample)
   files=list(Path(d).glob('*.json'))
   self.assertEqual(len(files),1)
   self.assertFalse(list(Path(d).glob('*.sqlite3')))
   self.assertEqual(json.loads(files[0].read_text())['profiles'][0]['profile_id'],first['profile_id'])
   with patch('ml.brand.profile_repository.os.replace',side_effect=OSError('interrupted write')):
    with self.assertRaises(OSError):store.get('https://example.com/','v1',sample,refresh=True)
   self.assertEqual(store.get('https://example.com/','v1',lambda:None)['profile_id'],first['profile_id'])
   self.assertFalse(list(Path(d).glob('*.tmp')))

 def test_repository_can_be_replaced_without_changing_analysis(self):
  from contextlib import nullcontext
  class MemoryRepository:
   row=None
   def lock(self,url,version):return nullcontext()
   def find_latest(self,url,version):return self.row
   def save(self,profile):self.row=dict(profile)
  repo=MemoryRepository()
  store=ProfileStore(repository=repo)
  a=store.get('https://example.com/','v1',sample)
  b=store.get('https://example.com/','v1',lambda:None)
  self.assertEqual(a['profile_id'],b['profile_id'])

 def test_multiple_processes_publish_one_json(self):
  import json
  from pathlib import Path
  with tempfile.TemporaryDirectory() as d:
   code="""from ml.brand.profiles import ProfileStore
import sys,time,json
from pathlib import Path
def create():
 with (Path(sys.argv[1])/'calls.txt').open('a') as f:f.write('created\\n')
 time.sleep(.1)
 return json.loads(sys.argv[2])
print(ProfileStore(sys.argv[1]).get('https://example.com/','v1',create)['profile_id'])
"""
   jobs=[subprocess.Popen([sys.executable,'-c',code,d,json.dumps(sample())],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(4)]
   ids=[]
   for job in jobs:
    out,err=job.communicate(timeout=15)
    self.assertEqual(job.returncode,0,err)
    ids.append(out.strip())
   self.assertEqual(len(set(ids)),1)
   self.assertEqual((Path(d)/'calls.txt').read_text().splitlines(),['created'])

 def test_corrupt_json_does_not_silently_reanalyze(self):
  from pathlib import Path
  with tempfile.TemporaryDirectory() as d:
   store=ProfileStore(d);store.get('https://example.com/','v1',sample)
   next(Path(d).glob('*.json')).write_text('{broken')
   with self.assertRaises(ValueError):store.get('https://example.com/','v1',lambda:self.fail('recomputed'))

 def test_factory_paths_do_not_depend_on_working_directory(self):
  import os
  from pathlib import Path
  from unittest.mock import patch
  from ml.brand import analyzer
  repo_root=Path(analyzer.__file__).resolve().parents[2]
  with tempfile.TemporaryDirectory() as elsewhere:
   original=Path.cwd()
   try:
    os.chdir(elsewhere)
    for configured in ['data/private/profiles-path-test', str(Path(elsewhere)/'server-profiles')]:
     getattr(analyzer, '_create_brand_analyzer', analyzer.get_brand_analyzer).cache_clear()
     with patch.dict(os.environ,{'OPENAI_API_KEY':'test-unused','FIRECRAWL_API_KEY':'test-unused','POPCAST_BRAND_PROFILE_DIR':configured}),patch('firecrawl.Firecrawl'),patch('openai.OpenAI'),patch('ml.brand.nli.TraitScorer'):
      instance=analyzer.get_brand_analyzer()
     expected=Path(configured)
     if not expected.is_absolute():expected=repo_root/expected
     self.assertEqual(instance.profile_store.repository.directory,expected.resolve())
   finally:
    os.chdir(original)
    getattr(analyzer, '_create_brand_analyzer', analyzer.get_brand_analyzer).cache_clear()

 def test_copied_json_reuses_profile_from_another_process_and_directory(self):
  import json
  import os
  import shutil
  from pathlib import Path
  repo_root=Path(__file__).resolve().parents[3]
  with tempfile.TemporaryDirectory() as d:
   local=Path(d)/'local';server=Path(d)/'server-persistent'
   first=ProfileStore(local).get('https://example.com/','v1',sample)
   shutil.copytree(local,server)
   code="""import json,sys
from ml.brand.profiles import ProfileStore
def forbidden():raise AssertionError('profile was recomputed')
print(json.dumps(ProfileStore(sys.argv[1]).get('https://example.com/','v1',forbidden)))
"""
   result=subprocess.run([sys.executable,'-c',code,str(server)],cwd=d,
                         env={**os.environ,'PYTHONPATH':str(repo_root)},
                         capture_output=True,text=True,check=True,timeout=15)
   reused=json.loads(result.stdout)
   self.assertEqual(reused['profile_id'],first['profile_id'])
   self.assertEqual(reused['trait_scores'],first['trait_scores'])
   self.assertTrue(reused['profile_cache_hit'])
