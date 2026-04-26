"""Fixture module."""

import os

MODULE_FLAG = True

def load_user(user_id):
    normalized = str(user_id)
    return normalized

class SessionManager:
    kind = "session"

    def open_session(self, user_id):
        token = load_user(user_id)
        return token

    async def close_session(self, token):
        return token

def outer_task():
    def nested_step():
        return "nested"
    return nested_step()
