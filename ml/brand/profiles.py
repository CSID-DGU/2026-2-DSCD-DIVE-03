"""Versioned, persistent brand profiles; never cache failed analyses."""
import hashlib
import inspect
import json
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from ml.brand.urls import BrandInputError, canonical_url

from ml.brand.profile_repository import JsonProfileRepository, ProfileRepository

_KEYS = {'spirited', 'trustworthy', 'upscale', 'stylish', 'well-organized', 'friendly', 'sentimental'}


def analysis_version(model):
    base = Path(__file__).parent
    files = ['urls.py', 'nli.py', 'sources.py', 'discovery.py', 'errors.py', 'images.py',
             'duplicates.py', 'descriptions.py', 'prompts.json', 'trait_config.json', 'official_sources.json']
    from ml.brand.analyzer import BrandAnalyzer
    h = hashlib.sha256(model.encode())
    # Storage adapter/bootstrap changes must not invalidate an analysis.
    h.update(inspect.getsource(BrandAnalyzer._analyze_uncached).encode())
    for name in files:
        path = base / name
        if path.is_file():
            h.update(name.encode()); h.update(path.read_bytes())
    return h.hexdigest()


def _validate(result):
    if not isinstance(result, dict) or not isinstance(result.get('description'), str) or not result['description'].strip():
        raise ValueError('유효한 브랜드 설명이 필요합니다.')
    scores = result.get('trait_scores')
    if not isinstance(scores, dict) or set(scores) != _KEYS:
        raise ValueError('브랜드 Trait 7개가 필요합니다.')
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or not 0 <= x <= 1 for x in scores.values()):
        raise ValueError('Trait 점수는 0~1이어야 합니다.')


class ProfileStore:
    """Analysis/reuse policy, independent of persistence format."""
    def __init__(self, directory=None, *, repository: ProfileRepository | None = None):
        if repository is None:
            if directory is None:
                raise ValueError('프로필 저장 위치가 필요합니다.')
            repository = JsonProfileRepository(directory)
        self.repository = repository

    def get(self, url, version, create, *, refresh=False):
        url = canonical_url(url)
        # PostgreSQL adapter must implement lock as a cross-process DB lock.
        with self.repository.lock(url, version):
            result = self.repository.find_latest(url, version)
            if result is not None and not refresh:
                _validate(result)
                return {**result, 'profile_cache_hit': True}
            result = dict(create())
            _validate(result)
            result.update(profile_id='brand_' + uuid.uuid4().hex, canonical_brand_url=url,
                          analysis_version=version, analyzed_at=datetime.now(timezone.utc).isoformat())
            self.repository.save(result)
            return {**result, 'profile_cache_hit': False}
