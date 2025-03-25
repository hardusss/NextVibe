import axios, { AxiosError } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetApiUrl from "../utils/url_api";


export default async function generateImage(promt: string) {
    try {
        const token = await AsyncStorage.getItem("access");
        const response = await axios.post(`${GetApiUrl()}/posts/generate-image/`, {}, {
            headers: {
            Authorization: `Bearer ${token}` ,
            },
            params: {
                promt: promt
            } 
        });
        const image_url = await response.data.image_url
        return `${image_url}`;
    } catch (error) {
        
    }
}