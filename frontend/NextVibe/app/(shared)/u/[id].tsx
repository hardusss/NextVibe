import React from "react";
import { useLocalSearchParams } from "expo-router";
import UserProfileView from "@/components/ProfilePage/UserProfilePage";
import ProximityTokenScreen from "./e";

export default function UserProfileOrProximityRoute() {
    const params = useLocalSearchParams<{ id?: string; t?: string }>();

    // If the path is /u/e or contains a proximity token 't', handle proximity flow instead of profile
    if (params.id === 'e' || params.t) {
        return <ProximityTokenScreen />;
    }

    return <UserProfileView />;
}