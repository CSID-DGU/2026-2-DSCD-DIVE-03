"""Request schema matching the existing React Trade-off client contract."""

from pydantic import BaseModel, Field, model_validator


class TradeOffRequest(BaseModel):
    recommendation_id: str = Field(min_length=1, max_length=100)
    space_ids: list[str] = Field(min_length=2, max_length=2)

    @model_validator(mode="after")
    def check_space_ids(self):
        if any(not isinstance(space_id, str) or not space_id.strip() for space_id in self.space_ids):
            raise ValueError("비교할 공간 ID를 정확히 두 개 입력해 주세요.")
        if self.space_ids[0] == self.space_ids[1]:
            raise ValueError("서로 다른 공간 두 개를 선택해 주세요.")
        return self
