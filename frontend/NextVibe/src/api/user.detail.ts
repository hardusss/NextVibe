import axios from "axios";
import { storage } from "../utils/storage";
import GetApiUrl from "../utils/url_api";


const getUserDetail = async (id?: number, isProfile? : boolean ) => {

    const TOKEN = await storage.getItem("access")
    const USER_ID = await storage.getItem("id")
    const response = await axios.get(`${GetApiUrl()}/users/user-detail/${id ? id : USER_ID}/`, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        },
        params: {
            isProfile: isProfile ? isProfile : false
        }
    })
    return response.data
    

}

export default getUserDetail;