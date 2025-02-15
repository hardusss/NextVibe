import { Text, TouchableOpacity } from 'react-native';
import { RegisterButtonProps } from '../../src/types/registerButton';
import registerStyles from '../../styles/dark-theme/registerStyles';
import Register from '../../src/api/registration';


export default function ButtonRegister(props: RegisterButtonProps) {
    const handleRegister = () => {
        Register(props.username, props.email, props.password, props.strength, props.privacy);
    }

    return (
        <TouchableOpacity style={registerStyles.registerButton} onPress={handleRegister}>
            <Text style={registerStyles.registerButtonText}>Register</Text>
        </TouchableOpacity>
    );
}
