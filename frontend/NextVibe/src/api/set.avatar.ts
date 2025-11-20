import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";

export default async function setAvatar (avatar: string)  {
    const TOKEN = await storage.getItem("access");
    const OWNER_ID = await storage.getItem("id");
    const formData = new FormData();
    formData.append("avatar", {
        uri: avatar,
        type: "image/jpeg",
        name: `avatar_${OWNER_ID}.jpg`,
    } as any);
    
    const config = {
        headers : {
            "Authorization": `Bearer ${TOKEN}`,
            "Content-Type": "multipart/form-data"
        },
    };

    const response = await axios.put(`${GetApiUrl()}/users/update/user-avatar/`, formData, config)

    return response.data
}