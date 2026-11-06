"""Rank candidate spaces from normalized factor scores and CSR weights."""

from collections.abc import Mapping
from math import fsum, isclose
from typing import TypedDict


class RankedCandidate(TypedDict):
    space_id: str
    rank: int
    final_score: float
    factor_scores: dict[str, float]
    contributions: dict[str, float]


def rank_candidates(
    scores_by_space: Mapping[str, Mapping[str, float]],
    weights: Mapping[str, float],
) -> list[RankedCandidate]:
    """Rank by full-precision score, preserving input order for exact ties."""
    if any(not 0 <= weight <= 1 for weight in weights.values()) or not isclose(
        fsum(weights.values()), 1.0
    ):
        raise ValueError("Weights must be in [0, 1] and sum to 1.")

    results: list[RankedCandidate] = []
    for space_id, scores in scores_by_space.items():
        factor_scores = {}
        contributions = {}
        for factor, weight in weights.items():
            score = scores.get(factor)
            if score is None or not 0 <= score <= 1:
                raise ValueError(f"Space {space_id!r} requires a score in [0, 1] for {factor!r}.")
            factor_scores[factor] = score
            contributions[factor] = 100 * weight * score

        final_score = fsum(contributions.values())
        if final_score > 100 and isclose(final_score, 100, rel_tol=0, abs_tol=1e-12):
            final_score = 100.0

        results.append(
            {
                "space_id": space_id,
                "rank": 0,
                "final_score": final_score,
                "factor_scores": factor_scores,
                "contributions": contributions,
            }
        )

    results.sort(key=lambda candidate: candidate["final_score"], reverse=True)
    for rank, candidate in enumerate(results, start=1):
        candidate["rank"] = rank
    return results
