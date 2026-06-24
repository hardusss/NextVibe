import { Text, TouchableOpacity, useColorScheme } from 'react-native';
import { RegisterButtonProps } from '../../src/types/registerButton';
import registerDarkStyles from '../../styles/dark-theme/registerStyles';
import registerLightStyles from '../../styles/light-theme/registerStyles';
import Register from '../../src/api/registration';
import { useRouter } from 'expo-router';


export default function ButtonRegister(props: RegisterButtonProps) {
    const router = useRouter();
    const isDark = useColorScheme() === 'dark';
    const styles = isDark ? registerDarkStyles : registerLightStyles;

    const handleRegister = () => {
        Register(props.username, props.email, props.password, router, props.inviteCode, props.strength, props.privacy);
    }

    return (
        <TouchableOpacity activeOpacity={0.7} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} style={styles.registerButton} onPress={handleRegister}>
            <Text style={styles.registerButtonText}>Register</Text>
        </TouchableOpacity>
    );
}
