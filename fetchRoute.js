export async function fetchRoute(coordsA, coordsB) {
  const start = `${coordsA.longitude},${coordsA.latitude}`;
  const end = `${coordsB.longitude},${coordsB.latitude}`;

  const url = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const pontos = data.routes[0].geometry.coordinates.map((coord) => ({
        latitude: coord[1],
        longitude: coord[0],
      }));
      const duracao = Math.ceil(data.routes[0].duration); // segundos
      return { pontos, duracao };
    }

    return { pontos: [], duracao: 0 };
  } catch (error) {
    console.error("Erro na API OSRM:", error);
    return { pontos: [], duracao: 0 };
  }
}
