const formatValue = (value: any, decimals: number) => {
    const num = Number(value);
    if (isNaN(num)) return '0.00';
    return num.toFixed(decimals);
};

export default formatValue;