"""Calculate Soft Filter scores and intermediate measures for candidate spaces."""

from collections.abc import Mapping, Sequence
from math import dist, fsum, isfinite, sqrt


_TRAIT_KEYS = (
    "spirited", "trustworthy", "upscale", "stylish",
    "well-organized", "friendly", "sentimental",
)


def _min_max(
    values: Sequence[float], *, reverse: bool = False, zero_tie_score: float = 0.5
) -> list[float]:
    if not values:
        return []

    minimum = min(values)
    maximum = max(values)
    if minimum == maximum:
        tie_score = zero_tie_score if minimum == 0 else 0.5
        return [tie_score] * len(values)

    span = maximum - minimum
    if reverse:
        return [(maximum - value) / span for value in values]
    return [(value - minimum) / span for value in values]


def subway_accessibility_scores(distances_m: Sequence[float]) -> list[float]:
    """Return 0–1 scores in candidate order using distances in meters."""
    if any(distance is None or not isfinite(distance) or distance < 0 for distance in distances_m):
        raise ValueError("Station distances must be finite, non-negative numbers.")

    return _min_max(distances_m, reverse=True)


def rental_price_fit_scores(
    prices_krw: Sequence[float], max_budget_krw: float
) -> list[float]:
    """Return 0–1 scores in candidate order. Compare prices on the budget's basis."""
    if max_budget_krw is None or not isfinite(max_budget_krw) or max_budget_krw <= 0:
        raise ValueError("Maximum budget must be a finite, positive number.")
    if any(price is None or not isfinite(price) or price < 0 for price in prices_krw):
        raise ValueError("Rental prices must be finite, non-negative numbers.")

    budget_ratios = [price / max_budget_krw for price in prices_krw]
    return _min_max(budget_ratios, reverse=True)


def target_ratio_scores(
    ratios_by_candidate: Sequence[Mapping[str, float]], selected_groups: Sequence[str]
) -> list[float]:
    """Sum selected demographic fractions and normalize across the candidates."""
    if not selected_groups or len(set(selected_groups)) != len(selected_groups):
        raise ValueError("Select at least one demographic group without duplicates.")

    totals = []
    for ratios in ratios_by_candidate:
        selected_ratios = []
        for group in selected_groups:
            ratio = ratios.get(group)
            if ratio is None or not 0 <= ratio <= 1:
                raise ValueError(f"Demographic group {group!r} requires a fraction in [0, 1].")
            selected_ratios.append(ratio)
        totals.append(fsum(selected_ratios))

    return _min_max(totals, zero_tie_score=0.0)


def popup_history_scores(counts: Sequence[int]) -> list[float]:
    """Normalize past same-category, same-district counts in candidate order."""
    if any(type(count) is not int or count < 0 for count in counts):
        raise ValueError("Popup history counts must be non-negative integers.")

    return _min_max(counts, zero_tie_score=0.0)


def area_fit_penalties(
    areas_pyeong: Sequence[float], min_pyeong: float, max_pyeong: float
) -> list[float]:
    """Calculate raw area penalties with a shortage multiplier of 3."""
    if not isfinite(max_pyeong) or not 0 <= min_pyeong <= max_pyeong:
        raise ValueError("The desired area range must be finite and ordered.")
    if any(area is None or not isfinite(area) or area < 0 for area in areas_pyeong):
        raise ValueError("Candidate areas must be finite, non-negative numbers.")

    penalties = []
    for area in areas_pyeong:
        if area < min_pyeong:
            penalties.append(3 * (min_pyeong - area))
        elif area > max_pyeong:
            penalties.append(area - max_pyeong)
        else:
            penalties.append(0.0)
    return penalties


def area_fit_scores(
    areas_pyeong: Sequence[float], min_pyeong: float, max_pyeong: float
) -> list[float]:
    """Normalize area penalties across candidates that passed the Hard Filter.

    Identical penalties receive 1.0 if zero, otherwise 0.5.
    """
    penalties = area_fit_penalties(areas_pyeong, min_pyeong, max_pyeong)
    return _min_max(penalties, reverse=True, zero_tie_score=1.0)


def _trait_vector(profile: Mapping[str, float]) -> list[float]:
    vector = []
    for key in _TRAIT_KEYS:
        value = profile.get(key)
        if value is None or not 0 <= value <= 1:
            raise ValueError(f"Trait {key!r} requires a score in [0, 1].")
        vector.append(value)
    return vector


def brand_space_distances(
    brand_traits: Mapping[str, float], space_traits: Sequence[Mapping[str, float]]
) -> list[float]:
    """Compare the seven shared traits by key and return raw Euclidean distances."""
    brand_vector = _trait_vector(brand_traits)
    return [dist(brand_vector, _trait_vector(profile)) for profile in space_traits]


def brand_space_fit_scores(
    brand_traits: Mapping[str, float], space_traits: Sequence[Mapping[str, float]]
) -> list[float]:
    """Convert Euclidean distances to 0–1 fit scores in candidate order."""
    max_distance = sqrt(len(_TRAIT_KEYS))
    distances = brand_space_distances(brand_traits, space_traits)
    return [1.0 - distance / max_distance for distance in distances]
