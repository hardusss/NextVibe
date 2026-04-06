import { Text, TouchableOpacity } from 'react-native';
import { RegisterButtonProps } from '../../src/types/registerButton';
import registerStyles from '../../styles/dark-theme/registerStyles';
import Register from '../../src/api/registration';
import { useRouter } from 'expo-router';


export default function ButtonRegister(props: RegisterButtonProps) {
    const router = useRouter();


    const handleRegister = () => {
        Register(props.username, props.email, props.password, router, props.inviteCode, props.strength, props.privacy);
    }

    return (
        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={registerStyles.registerButton} onPress={handleRegister}>
            <Text style={registerStyles.registerButtonText}>Register</Text>
        </TouchableOpacity>
    );
}
