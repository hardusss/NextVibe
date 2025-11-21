import { Redirect } from "expo-router";
import { LogBox } from 'react-native';
import { setupAxiosInterceptor } from "@/src/utils/axiosInterceptor";

setupAxiosInterceptor();
LogBox.ignoreAllLogs(true); 

export default function Index() {
    return <Redirect href="/splash" />;
}
