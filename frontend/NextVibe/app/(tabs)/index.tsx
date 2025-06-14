import { Redirect } from "expo-router";
import { LogBox } from 'react-native';

LogBox.ignoreAllLogs(true); // ⛔️ Сховає всі помилки й попередження

export default function Index() {
    return <Redirect href="/splash" />;
}
