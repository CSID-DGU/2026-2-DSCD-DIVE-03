import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from unittest.mock import patch

from ml.brand import analyzer


class InitializationTests(unittest.TestCase):
    def test_simultaneous_first_calls_construct_only_once(self):
        calls = []
        barrier = threading.Barrier(6)
        instance = object()

        @lru_cache(maxsize=1)
        def create():
            calls.append(1)
            time.sleep(0.04)
            return instance

        def get(_):
            barrier.wait(timeout=3)
            return analyzer.get_brand_analyzer()

        with patch.object(analyzer, '_create_brand_analyzer', create):
            with ThreadPoolExecutor(max_workers=6) as pool:
                results = list(pool.map(get, range(6)))
        self.assertEqual(len(calls), 1)
        self.assertTrue(all(result is instance for result in results))

    def test_failed_creation_can_be_retried(self):
        calls = []
        instance = object()

        @lru_cache(maxsize=1)
        def create():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError('temporary initialization failure')
            return instance

        with patch.object(analyzer, '_create_brand_analyzer', create):
            with self.assertRaises(RuntimeError):
                analyzer.get_brand_analyzer()
            self.assertIs(analyzer.get_brand_analyzer(), instance)
            self.assertIs(analyzer.get_brand_analyzer(), instance)
        self.assertEqual(len(calls), 2)
