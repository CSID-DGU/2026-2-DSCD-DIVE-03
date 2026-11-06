"""Score subway access and rental fit within a set of candidate spaces."""

from collections.abc import Sequence
from math import isfinite


def _reverse_min_max(values: Sequence[float]) -> list[float]:
    if not values:
        return []

    minimum = min(values)
    maximum = max(values)
    if minimum == maximum:
        raise ValueError("Reverse Min-Max requires at least two distinct values.")

    return [(maximum - value) / (maximum - minimum) for value in values]


def subway_accessibility_scores(distances_m: Sequence[float]) -> list[float]:
    """Return 0–1 scores in candidate order using distances in meters."""
    if any(distance is None or not isfinite(distance) or distance < 0 for distance in distances_m):
        raise ValueError("Station distances must be finite, non-negative numbers.")

    return _reverse_min_max(distances_m)


def rental_price_fit_scores(
    prices_krw: Sequence[float], max_budget_krw: float
) -> list[float]:
    """Return 0–1 scores in candidate order. Compare prices on the budget's basis."""
    if max_budget_krw is None or not isfinite(max_budget_krw) or max_budget_krw <= 0:
        raise ValueError("Maximum budget must be a finite, positive number.")
    if any(price is None or not isfinite(price) or price < 0 for price in prices_krw):
        raise ValueError("Rental prices must be finite, non-negative numbers.")

    budget_ratios = [price / max_budget_krw for price in prices_krw]
    return _reverse_min_max(budget_ratios)
