from google.oauth2 import id_token
from google.auth.transport import requests

WEB_CLIENT_ID = "1063264156706-l99os5o2se3h9rs8tcuuolo3kfio7osn.apps.googleusercontent.com"

def validate(tokenID):
    try: 
        idInfo = id_token.verify_oauth2_token(
            id_token=tokenID,
            request=requests.Request(),
            audience=WEB_CLIENT_ID
        )

        return idInfo
    except Exception as e:
        return None