import json
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

import pandas as pd

from app.services import availability as a


def frame(ids):
    return pd.DataFrame([
        {"seq": str(i), "name": f"space-{i}",
         "page_url": f"https://shareit.kr/venue/{i}"}
        for i in ids
    ])


class AvailabilityTests(unittest.TestCase):
    def test_unsupported_skips_every_date_and_keeps_candidate(self):
        with patch.object(a, "get_shareit_schedule_support", return_value=False), \
             patch.object(a, "get_shareit_timelines") as daily:
            result = a.filter_spaces_by_period(frame([17183]), "2026-11-19", "2026-11-25")
        daily.assert_not_called()
        self.assertEqual(result.seq.tolist(), ["17183"])
        self.assertEqual(result.availability_status.tolist(), ["assumed_available"])

    def test_supported_and_unknown_preserve_date_rules_and_row_order(self):
        calls = []

        def daily(sid, day):
            calls.append((sid, day))
            if sid == 3 and day.endswith("19"):
                raise RuntimeError("temporary failure")
            return [{"sale": sid != 2 and not (sid == 3 and day.endswith("20"))}]

        with patch.object(a, "get_shareit_schedule_support", side_effect=lambda sid: None if sid == 3 else True), \
             patch.object(a, "get_shareit_timelines", side_effect=daily), \
             patch.object(a.time, "sleep"):
            result = a.filter_spaces_by_period(frame([1, 2, 3, 4]), "2026-11-19", "2026-11-21")
        self.assertEqual(result.seq.tolist(), ["1", "4"])
        self.assertEqual(result.availability_status.tolist(), ["api_slots_available"] * 2)
        self.assertEqual(sum(sid == 2 for sid, _ in calls), 1)
        self.assertEqual(sum(sid == 3 for sid, _ in calls), 2)

    def test_max_four_spaces_and_completion_order_does_not_reorder(self):
        lock = threading.Lock()
        active = peak = 0

        def support(sid):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            time.sleep(0.04 if sid % 2 else 0.01)
            with lock:
                active -= 1
            return False

        with patch.object(a, "get_shareit_schedule_support", side_effect=support):
            result = a.filter_spaces_by_period(frame(range(12)), "2026-11-19", "2026-11-25")
        self.assertEqual(peak, 4)
        self.assertEqual(result.seq.tolist(), [str(i) for i in range(12)])

    def test_non_shareit_and_empty_input_do_not_make_requests(self):
        other = frame([1]); other["page_url"] = "https://example.com/space/1"
        with patch.object(a, "get_shareit_schedule_support") as support:
            result = a.filter_spaces_by_period(other, "2026-11-19", "2026-11-25")
            empty = a.filter_spaces_by_period(other.iloc[:0], "2026-11-19", "2026-11-25")
        support.assert_not_called()
        self.assertEqual(result.availability_source.tolist(), ["not_supported"])
        self.assertTrue(empty.empty)
        self.assertIn("availability_status", empty)
        with self.assertRaises(ValueError):
            a.filter_spaces_by_period(other, "2026-11-25", "2026-11-19")

    def test_support_parser_requires_matching_id_and_explicit_boolean(self):
        def html(sid, flag):
            data = {"props": {"pageProps": {"dehydratedState": {"queries": [
                {"state": {"data": {"seq": sid, "realTimeSchedule": flag}}}
            ]}}}}
            return '<script id="__NEXT_DATA__" type="application/json">' + json.dumps(data) + '</script>'

        session = Mock()
        response = session.get.return_value
        response.url = "https://shareit.kr/venue/1"
        with patch.object(a, "_get_session", return_value=session):
            for sid, flag, expected in [(1, False, False), (1, True, True), (2, False, None), (1, "false", None)]:
                response.text = html(sid, flag)
                self.assertIs(a.get_shareit_schedule_support(1), expected)
            response.text = "invalid page"
            self.assertIsNone(a.get_shareit_schedule_support(1))
            response.raise_for_status.side_effect = RuntimeError("404")
            self.assertIsNone(a.get_shareit_schedule_support(1))

    def test_only_explicit_unsupported_error_stops_remaining_dates(self):
        response = Mock()
        response.status_code = 400
        response.json.return_value = {"message": "실시간 일정연동이 불가능한 공간 입니다."}
        response.raise_for_status.side_effect = RuntimeError("400")
        session = Mock(); session.get.return_value = response
        with patch.object(a, "_get_session", return_value=session), patch.object(a.time, "sleep"):
            self.assertEqual(a.check_shareit_period(1, "2026-11-19", "2026-11-25"), "assumed_available")
        self.assertEqual(session.get.call_count, 1)
        response.json.return_value = {"message": "다른 오류"}
        session.get.reset_mock()
        with patch.object(a, "_get_session", return_value=session), patch.object(a.time, "sleep"):
            self.assertEqual(a.check_shareit_period(1, "2026-11-19", "2026-11-25"), "assumed_available")
        self.assertEqual(session.get.call_count, 7)

    def test_http_sessions_are_isolated_between_workers(self):
        gate = threading.Barrier(4)
        sessions = []
        lock = threading.Lock()

        def support(sid):
            session = a._get_session()
            with lock:
                sessions.append(session)
            gate.wait(timeout=3)
            return False

        with patch.object(a, "get_shareit_schedule_support", side_effect=support):
            a.filter_spaces_by_period(frame(range(4)), "2026-11-19", "2026-11-25")
        self.assertEqual(len({id(s) for s in sessions}), 4)

    def test_overlapping_recommendations_share_the_four_space_limit(self):
        lock = threading.Lock()
        active = peak = 0

        def support(sid):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            time.sleep(0.01)
            with lock:
                active -= 1
            return False

        with patch.object(a, "get_shareit_schedule_support", side_effect=support):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(
                    lambda _: a.filter_spaces_by_period(frame(range(8)), "2026-11-19", "2026-11-25"),
                    range(2),
                ))
        self.assertEqual(peak, 4)
        self.assertEqual([len(result) for result in results], [8, 8])

    def test_all_excluded_preserves_empty_response_columns(self):
        with patch.object(a, "get_shareit_schedule_support", return_value=True), \
             patch.object(a, "get_shareit_timelines", return_value=[{"sale": False}]):
            result = a.filter_spaces_by_period(frame([1, 2]), "2026-11-19", "2026-11-25")
        self.assertTrue(result.empty)
        self.assertIn("availability_status", result)
        self.assertIn("availability_source", result)


if __name__ == "__main__":
    unittest.main()
