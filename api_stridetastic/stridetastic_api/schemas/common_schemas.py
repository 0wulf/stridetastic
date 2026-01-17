from ninja import Field, Schema


class MessageSchema(Schema):
    message: str = Field(..., description="Response message")
