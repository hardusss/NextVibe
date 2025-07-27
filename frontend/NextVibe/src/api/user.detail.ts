import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


const getUserDetail = async (id?: number, isProfile? : boolean ) => {

    const TOKEN = await AsyncStorage.getItem("access")
    const USER_ID = await AsyncStorage.getItem("id")
    console.log(TOKEN)
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