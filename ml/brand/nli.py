"""Score brand descriptions with the brand hypotheses and the pinned shared NLI model."""

import json
from pathlib import Path
from threading import Lock


class TraitScorer:
    def __init__(self, device="cpu"):
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        torch.set_num_threads(4)
        self.config = json.loads(Path(__file__).with_name("trait_config.json").read_text())
        self.torch = torch
        self.device = device
        self.lock = Lock()
        options = {
            "revision": self.config["nli_revision"],
        }
        self.tokenizer = AutoTokenizer.from_pretrained(self.config["nli_model"], **options)
        self.model = AutoModelForSequenceClassification.from_pretrained(
            self.config["nli_model"], **options
        ).to(device=device, dtype=torch.float32).eval()
        labels = {int(k): v.lower() for k, v in self.model.config.id2label.items()}
        self.entailment = next(k for k, v in labels.items() if v == "entailment")

    def score(self, description):
        if not description.strip():
            raise ValueError("브랜드 설명이 비어 있습니다.")
        hypotheses = self.config["hypotheses"]
        with self.lock:
            inputs = self.tokenizer(
                [description] * len(hypotheses), list(hypotheses.values()),
                padding=True, truncation=False, return_tensors="pt",
            )
            if inputs["input_ids"].shape[1] > self.config["max_tokens"]:
                raise ValueError("브랜드 설명이 NLI 입력 한도를 초과합니다.")
            with self.torch.inference_mode():
                logits = self.model(**{
                    k: v.to(self.device) for k, v in inputs.items()
                }).logits
                scores = logits.softmax(dim=-1)[:, self.entailment].cpu().tolist()
        return dict(zip(hypotheses, scores, strict=True))
