import { Redirect, RelativePathString } from "expo-router";
import { LogBox } from 'react-native';
import { setupAxiosInterceptor } from "@/src/utils/axiosInterceptor";
import React from 'react';

setupAxiosInterceptor();
LogBox.ignoreAllLogs(true); 

export default function Index() {
    return <Redirect href={"/eas-update" as RelativePathString} />;
}