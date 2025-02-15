import * as Yup from 'yup';
import Toast from 'react-native-toast-message';


const schema = Yup.object().shape({
    email: Yup.string().email('Invalid email address').required('Email is required')
        .matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid email address'),
    password: Yup.string().required('Password is required')
        .min(8, 'Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Password requires english letters, number, and symbols')
});

export default function validationInput ( email: string, password: string) {
    try {
        schema.validateSync({email: email, password: password }, { abortEarly: false });
        return true;
    } catch (error: any) {
        error.inner.forEach((err: any) => {
            Toast.show({
                type: 'error',
                text1: err.message,
                text2: 'Please fill in this field correctly'
            });
        });
        return false;
    }
};