import { GoogleSignin } from "@react-native-google-signin/google-signin";

// The single source of truth for Google Sign-In client IDs.
// GoogleSignin.configure() is global last-write-wins: any screen that calls it
// with different IDs silently breaks sign-in app-wide, so every call site must
// go through this helper.
//
// webClientId is the audience the backend pins idToken validation to
// (user/utils/validate_google_token_id.py) — changing it breaks token checks.
// iosClientId must match GoogleService-Info.plist and the reversed-client-id
// URL scheme in Info.plist.
export const GOOGLE_WEB_CLIENT_ID =
    "1063264156706-l99os5o2se3h9rs8tcuuolo3kfio7osn.apps.googleusercontent.com";
export const GOOGLE_IOS_CLIENT_ID =
    "1063264156706-9of910einuhchb1pef6g482vu8b91nh4.apps.googleusercontent.com";

export function configureGoogleSignin(): void {
    GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID,
        offlineAccess: true,
    });
}
