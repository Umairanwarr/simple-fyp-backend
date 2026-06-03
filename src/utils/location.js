const parseCoordinate = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildLocationFromRequest = ({
  latitude,
  longitude,
  placeId,
  formattedAddress
} = {}) => {
  const parsedLatitude = parseCoordinate(latitude);
  const parsedLongitude = parseCoordinate(longitude);

  if (
    parsedLatitude === null
    || parsedLongitude === null
    || parsedLatitude < -90
    || parsedLatitude > 90
    || parsedLongitude < -180
    || parsedLongitude > 180
  ) {
    return null;
  }

  return {
    type: 'Point',
    coordinates: [parsedLongitude, parsedLatitude],
    placeId: String(placeId || '').trim(),
    formattedAddress: String(formattedAddress || '').trim()
  };
};

export const mapLocationPayload = (location) => {
  if (!Array.isArray(location?.coordinates) || location.coordinates.length !== 2) {
    return null;
  }

  const [longitude, latitude] = location.coordinates;

  return {
    latitude,
    longitude,
    placeId: String(location.placeId || '').trim(),
    formattedAddress: String(location.formattedAddress || '').trim()
  };
};
