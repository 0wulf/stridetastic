from ninja import Field, Schema


class LoginSchema(Schema):
    username: str = Field(..., description="Username of the user", example="root")
    password: str = Field(..., description="Password of the user", example="password")


class TokenSchema(Schema):
    access: str = Field(
        ...,
        description="Access token",
        example="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    )
    refresh: str = Field(
        ...,
        description="Refresh token",
        example="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    )


class RefreshTokenSchema(Schema):
    refresh: str = Field(
        ...,
        description="Refresh token to use for generating a new access token",
        example="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    )
