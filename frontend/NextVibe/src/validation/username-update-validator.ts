import * as Yup from 'yup';
const schema = Yup.object().shape({
    username: Yup.string()
        .min(3, 'Username must be at least 3 characters')
        .max(30, 'Username must be at most 30 characters')
        .matches(
            /^[a-zA-Z0-9](?!.*[._]{2})[a-zA-Z0-9._]*[a-zA-Z0-9]$/,
            'Username can contain only letters, numbers, dots\n, underscores, no spaces, and cannot start/end with . or _'
        ),
});

export default function validationUsername(username: string) {
    try {
        schema.validateSync({ username }, { abortEarly: false });
        return {ok: true };
    } catch (error: any) {
        return {ok: false, error: error.message};
    }
}