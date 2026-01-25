import os
from dotenv import load_dotenv

load_dotenv()

ENV = os.getenv("DJANGO_ENV", "dev")  

if ENV == "prod":
    from .setting.prod import *
else:
    from .setting.dev import *
