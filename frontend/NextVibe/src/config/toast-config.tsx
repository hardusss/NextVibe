import {BaseToast, ErrorToast, ToastConfig, ToastConfigParams} from 'react-native-toast-message';
export const toastConfig: ToastConfig = {
    success: (props: ToastConfigParams<any>) => {
        return (
            <BaseToast
                {...props}
                style={{backgroundColor: 'black', borderLeftColor: 'lightgreen'}}
                contentContainerStyle={{paddingHorizontal: 15}}
                text1Style={{color: 'lightgreen'}}
                text2Style={{color: 'darkgray'}}
            />
        )
    },
    error: (props: ToastConfigParams<any>) => {
        return (
            <ErrorToast
                {...props}
                style={{backgroundColor: 'black', borderLeftColor: 'red'}}
                contentContainerStyle={{paddingHorizontal: 15}}
                text1Style={{color: 'red'}}
                text2Style={{color: 'darkgray'}}
            />
        )
    }
}