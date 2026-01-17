from django.contrib.auth import authenticate
from ninja_extra import api_controller, route
from ninja_jwt.tokens import RefreshToken

from ..schemas.auth_schemas import LoginSchema, RefreshTokenSchema, TokenSchema
from ..schemas.common_schemas import MessageSchema


@api_controller("/auth", tags=["Authentication"], permissions=[])
class AuthController:
    @route.post("/login", response={200: TokenSchema, 401: MessageSchema})
    def login(self, data: LoginSchema):
        """
        Handle user login.
        """
        user = authenticate(username=data.username, password=data.password)
        if user:
            refresh = RefreshToken.for_user(user)
            access = refresh.access_token

            return 200, TokenSchema(access=str(access), refresh=str(refresh))
        return 401, MessageSchema(message="Invalid credentials")

    @route.post("/refresh-token", response={200: TokenSchema, 401: MessageSchema})
    def refresh_token(self, data: RefreshTokenSchema):
        """
        Handle token refresh.
        """
        try:
            refresh = RefreshToken(data.refresh)
            access = refresh.access_token

            return 200, TokenSchema(access=str(access), refresh=str(refresh))
        except Exception:
            return 401, MessageSchema(message="Invalid refresh token")
