import * as Yup from 'yup';
import Toast from 'react-native-toast-message';
const schema = Yup.object().shape({
    username: Yup.string()
        .required('Username is required')
        .min(3, 'Username must be at least 3 characters')
        .max(30, 'Username must be at most 30 characters')
        .matches(
            /^[a-zA-Z0-9](?!.*[._]{2})[a-zA-Z0-9._]*[a-zA-Z0-9]$/,
            'Username can contain only letters, numbers, dots, underscores, no spaces, and cannot start/end with . or _'
        ),

    email: Yup.string()
        .email('Invalid email address')
        .required('Email is required')
        .matches(
            /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            'Invalid email address'
        ),
    password: Yup.string()
        .required('Password is required')
        .min(8, 'Password must be at least 8 characters')
        .matches(/[a-z]/, 'Must include a lowercase letter')
        .matches(/[A-Z]/, 'Must include an uppercase letter')
        .matches(/\d/, 'Must include a number')
        .matches(/[@$!%*?&]/, 'Must include a special character (@$!%*?&)')
        .matches(/^[A-Za-z0-9@$!%*?&]+$/, 'Contains invalid characters')

});

export default function validationInput(username: string, email: string, password: string) {
    try {
        schema.validateSync({ username, email, password }, { abortEarly: false });
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
}