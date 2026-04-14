export const getLocationName = async (lng: number, lat: number) => {
    try {
        const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=poi,place,address&language=en&worldview=US`
        );
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const placeName = data.features[0].place_name_en ?? data.features[0].place_name;

            return (placeName.split(',')[0]);
        }
    } catch (error) {
        console.error("Geocoding error:", error);
    }
};