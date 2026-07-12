import { Redirect, RelativePathString } from "expo-router";
import { LogBox } from 'react-native';
import React from 'react';

LogBox.ignoreAllLogs(true); 

export default function Index() {
    return <Redirect href={"/splash" as RelativePathString} />;
}
