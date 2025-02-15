import * as Yup from 'yup';
import Toast from 'react-native-toast-message';


const schema = Yup.object().shape({
    username: Yup.string().required('Username is required')
        .min(3, 'Username must be at least 3 characters')
        .max(20, 'Username must be at most 20 characters')
        .matches(/^[a-zA-Z0-9]+$/, 'Username must contain only letters and numbers'),
    email: Yup.string().email('Invalid email address').required('Email is required')
        .matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid email address'),
    password: Yup.string().required('Password is required')
        .min(8, 'Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Password requires english letters, number, and symbols')
});

export default function validationInput (username: string, email: string, password: string) {
    try {
        schema.validateSync({ username: username, email: email, password: password }, { abortEarly: false });
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