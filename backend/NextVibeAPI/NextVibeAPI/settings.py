import os

ENV = os.getenv("DJANGO_ENV", "dev")  

if ENV == "prod":
    from .setting.prod import *
else:
    from .setting.dev import *
