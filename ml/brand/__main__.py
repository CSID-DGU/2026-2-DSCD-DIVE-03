"""Run one official URL analysis and compare it with a space Trait CSV."""

import argparse
import csv
import json
from pathlib import Path

from ml.brand.analyzer import get_brand_analyzer
from ml.recommendation.scoring import brand_space_fit_scores


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--spaces", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    with args.spaces.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    profiles = [json.loads(row["trait_scores"]) for row in rows]
    analysis = get_brand_analyzer().analyze(args.url)
    scores = brand_space_fit_scores(analysis["trait_scores"], profiles)
    analysis["spaces"] = sorted(
        [{"space_id": row["seq"], "name": row["name"], "brand_space_fit": score}
         for row, score in zip(rows, scores, strict=True)],
        key=lambda item: item["brand_space_fit"], reverse=True,
    )
    args.output.write_text(json.dumps(analysis, ensure_ascii=False, indent=2) + "\n")
    print(f"브랜드 분석과 공간 {len(rows)}곳의 점수를 저장했습니다.")


if __name__ == "__main__":
    main()
