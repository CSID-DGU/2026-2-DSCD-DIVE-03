"""Compute CSR weights for active factors in order of importance."""

from collections.abc import Sequence
from itertools import accumulate
from math import fsum


def csr_weights(
    selected: Sequence[str], importance_gaps: Sequence[int]
) -> dict[str, float]:
    """Return normalized weights keyed by the selected factor IDs."""
    if not selected or len(set(selected)) != len(selected):
        raise ValueError("Select at least one factor and do not repeat factor IDs.")
    if len(importance_gaps) != len(selected) - 1:
        raise ValueError("Provide one importance gap per adjacent pair of factors.")
    if any(type(gap) is not int or not 0 <= gap <= 3 for gap in importance_gaps):
        raise ValueError("Importance gaps must be integers from 0 to 3.")

    positions = list(accumulate(importance_gaps, initial=1))
    scale_length = positions[-1]
    raw_weights = [
        1 / position + (scale_length + 1 - position) / scale_length
        for position in positions
    ]
    total_weight = fsum(raw_weights)
    return {
        factor: weight / total_weight
        for factor, weight in zip(selected, raw_weights, strict=True)
    }
