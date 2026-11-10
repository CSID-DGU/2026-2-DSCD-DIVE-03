"""Persistence boundary: replace this adapter to use PostgreSQL later."""
import hashlib
import json
import os
import tempfile
from contextlib import AbstractContextManager
from pathlib import Path
from typing import Protocol

from filelock import FileLock


class ProfileRepository(Protocol):
    def lock(self, url: str, version: str) -> AbstractContextManager: ...
    def find_latest(self, url: str, version: str) -> dict | None: ...
    def save(self, profile: dict) -> None: ...


def profile_key(url, version):
    return hashlib.sha256((url + '\n' + version).encode()).hexdigest()


class JsonProfileRepository:
    """One JSON history per canonical URL/version, protected by a per-key lock."""
    def __init__(self, directory):
        self.directory = Path(directory).expanduser().resolve()

    def _path(self, url, version):
        return self.directory / f'{profile_key(url, version)}.json'

    def lock(self, url, version):
        self.directory.mkdir(parents=True, exist_ok=True)
        return FileLock(str(self.directory / f'{profile_key(url, version)}.lock'), timeout=600)

    def _read(self, url, version):
        path = self._path(url, version)
        if not path.exists():
            return {'schema_version': 1, 'canonical_brand_url': url,
                    'analysis_version': version, 'profiles': []}
        data = json.loads(path.read_text(encoding='utf-8'))
        if (data.get('schema_version') != 1 or data.get('canonical_brand_url') != url
                or data.get('analysis_version') != version or not isinstance(data.get('profiles'), list)):
            raise ValueError('저장된 브랜드 프로필 형식/식별자가 올바르지 않습니다.')
        if any(not isinstance(p, dict) or p.get('canonical_brand_url') != url
               or p.get('analysis_version') != version for p in data['profiles']):
            raise ValueError('저장된 프로필 이력이 올바르지 않습니다.')
        return data

    def find_latest(self, url, version):
        rows = self._read(url, version)['profiles']
        return rows[-1] if rows else None

    def save(self, profile):
        # Caller must hold lock() across lookup, analysis and save.
        url, version = profile['canonical_brand_url'], profile['analysis_version']
        data = self._read(url, version)
        data['profiles'].append(profile)
        encoded = json.dumps(data, ensure_ascii=False, allow_nan=False, indent=2)
        self.directory.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            # Same directory/filesystem is required for atomic replacement.
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                             dir=self.directory, suffix='.tmp', delete=False) as f:
                temporary = Path(f.name)
                f.write(encoded)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temporary, self._path(url, version))
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
