import * as Yup from 'yup';
import Toast from 'react-native-toast-message';


const schema = Yup.object({
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),

  password: Yup.string()
    .required('Password is required'),
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