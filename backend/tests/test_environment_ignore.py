import pathlib
import subprocess
import unittest

class EnvironmentIgnoreTests(unittest.TestCase):
    def test_virtual_environment_is_git_ignored(self):
        root = pathlib.Path(__file__).resolve().parents[2]
        result = subprocess.run(["git", "check-ignore", "--no-index", "backend/.venv312/pyvenv.cfg"], cwd=root, capture_output=True)
        self.assertEqual(result.returncode, 0)
