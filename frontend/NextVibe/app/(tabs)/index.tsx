import { Redirect } from "expo-router";
import { LogBox } from 'react-native';

LogBox.ignoreAllLogs(true); 

export default function Index() {
    return <Redirect href="/splash" />;
}
