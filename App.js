import { useState, useEffect, useRef } from "react";
import MapView, { UrlTile, Polyline, Marker } from "react-native-maps";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
  TextInput,
  Vibration,
} from "react-native";
import { Dimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUserLocation } from "./getUserLocation";
import { watchUserLocation } from "./watchUserLocation";
import { fetchAddress } from "./fetchAddress";
import { fetchRoute } from "./fetchRoute";

const { width, height } = Dimensions.get("window");
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.04;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;
const CHAVE_HISTORICO = "@historico_rotas";

// formata segundos para MM:SS
function formatarContagem(segundos) {
  const abs = Math.abs(segundos);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// formata segundos para texto legível, ex: "25 min" ou "1h 5min"
function formatarTempoMin(segundos) {
  const min = Math.round(Math.abs(segundos) / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// formata string iso para "DD/MM às HH:MM"
function formatarData(isoString) {
  const d = new Date(isoString);
  const dia = d.getDate().toString().padStart(2, "0");
  const mes = (d.getMonth() + 1).toString().padStart(2, "0");
  const hora = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${dia}/${mes} às ${hora}:${min}`;
}

export default function App() {
  const mapRef = useRef();
  const timerRef = useRef(null);

  const [userLocation, setUserLocation] = useState(null);
  const userCoords = userLocation?.coords;

  const [destino, setDestino] = useState(null);
  const [carregandoRota, setCarregandoRota] = useState(false);
  const [modalMonitorar, setModalMonitorar] = useState(false);
  const [modalHistorico, setModalHistorico] = useState(false);
  const [tempoEstimado, setTempoEstimado] = useState(0);
  const [tempoSelecionado, setTempoSelecionado] = useState(0);
  const [minutosTexto, setMinutosTexto] = useState("");
  const [monitorando, setMonitorando] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(null);
  const [inicioMonitoramento, setInicioMonitoramento] = useState(null);
  const [historico, setHistorico] = useState([]);

  async function carregarHistorico() {
    try {
      const json = await AsyncStorage.getItem(CHAVE_HISTORICO);
      if (json != null) setHistorico(JSON.parse(json));
    } catch (erro) {
      console.error("Erro ao carregar histórico:", erro);
    }
  }

  async function salvarHistorico(lista) {
    try {
      await AsyncStorage.setItem(CHAVE_HISTORICO, JSON.stringify(lista));
    } catch (erro) {
      console.error("Erro ao salvar histórico:", erro);
    }
  }

  function adicionarEntrada(tempoReal, chegouNoTempo, enderecoItem, estimado, selecionado) {
    const entrada = {
      id: Date.now().toString(),
      endereco: enderecoItem || "Destino desconhecido",
      tempoEstimado: estimado,
      tempoSelecionado: selecionado,
      tempoReal,
      chegouNoTempo,
      data: new Date().toISOString(),
    };
    setHistorico((prev) => {
      const nova = [entrada, ...prev];
      salvarHistorico(nova);
      return nova;
    });
  }

  function removerEntrada(id) {
    setHistorico((prev) => {
      const nova = prev.filter((h) => h.id !== id);
      salvarHistorico(nova);
      return nova;
    });
  }

  async function definirDestino(coords) {
    setDestino(null);
    setMonitorando(false);
    setTempoRestante(null);
    setInicioMonitoramento(null);
    setCarregandoRota(true);

    const dadosEndereco = await fetchAddress(coords);
    const endereco = dadosEndereco?.display_name || "Destino selecionado";
    console.log("endereço:", endereco);

    let rota = [];
    if (userCoords) {
      const resultado = await fetchRoute(userCoords, coords);
      rota = resultado.pontos;
      const mins = Math.max(1, Math.round(resultado.duracao / 60));
      setTempoEstimado(resultado.duracao);
      setTempoSelecionado(mins * 60);
      setMinutosTexto(String(mins));
    }
    setCarregandoRota(false);
    console.log("rota calculada, pontos:", rota.length);

    const novoDestino = { ...coords, endereco, rota };
    setDestino(novoDestino);

    if (rota.length > 1) {
      const lats = rota.map((p) => p.latitude);
      const lngs = rota.map((p) => p.longitude);
      mapRef.current.animateToRegion(
        {
          latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
          longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
          latitudeDelta: (Math.max(...lats) - Math.min(...lats)) * 1.5 + 0.01,
          longitudeDelta: (Math.max(...lngs) - Math.min(...lngs)) * 1.5 + 0.01,
        },
        1000,
      );
    }
  }

  function aoPresionarMapa(event) {
    definirDestino(event.nativeEvent.coordinate);
  }

  function iniciarMonitoramento() {
    const mins = parseInt(minutosTexto);
    if (isNaN(mins) || mins < 1) {
      Alert.alert("Tempo inválido", "Digite um número de minutos válido.");
      return;
    }
    const segundos = mins * 60;
    setTempoSelecionado(segundos);
    setInicioMonitoramento(Date.now());
    setTempoRestante(segundos);
    setMonitorando(true);
    setModalMonitorar(false);
  }

  async function confirmarChegada() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const tempoReal = inicioMonitoramento
      ? Math.round((Date.now() - inicioMonitoramento) / 1000)
      : tempoSelecionado;
    const chegouNoTempo = tempoReal <= tempoSelecionado;
    adicionarEntrada(tempoReal, chegouNoTempo, destino?.endereco, tempoEstimado, tempoSelecionado);
    setMonitorando(false);
    setTempoRestante(null);
    setInicioMonitoramento(null);
    Alert.alert("✅ Chegada confirmada!", "Percurso registrado no histórico.");
  }

  function aoMudarLocalizacao(loc) {
    console.log("location change", loc);
    setUserLocation(loc);
  }

  async function carregarLocalizacao() {
    const loc = await getUserLocation();
    console.log("loadUserLocation", loc);
    setUserLocation(loc);
    if (loc?.coords) {
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: LATITUDE_DELTA,
          longitudeDelta: LONGITUDE_DELTA,
        },
        800,
      );
    }
  }

  useEffect(() => {
    carregarHistorico();
    carregarLocalizacao();

    let locationSubscription;
    watchUserLocation(aoMudarLocalizacao).then((sub) => {
      locationSubscription = sub;
    });
    return () => locationSubscription && locationSubscription.remove();
  }, []);

  // decrementa a cada segundo; ao zerar vibra e continua contando o atraso
  useEffect(() => {
    if (!monitorando) return;

    let alertaDisparado = false;
    const enderecoCapturado = destino?.endereco;
    const estimadoCapturado = tempoEstimado;
    const selecionadoCapturado = tempoSelecionado;

    timerRef.current = setInterval(() => {
      setTempoRestante((prev) => {
        if (prev === 1 && !alertaDisparado) {
          alertaDisparado = true;
          Vibration.vibrate([0, 400, 200, 400, 200, 400]);
          setTimeout(() => {
            Alert.alert(
              "⏰ Tempo esgotado!",
              "O prazo terminou, mas o monitoramento continua. Toque em 'Cheguei!' ao chegar.",
              [{ text: "OK" }],
            );
          }, 0);
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [monitorando]);

  const emAtraso = tempoRestante !== null && tempoRestante < 0;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType="none"
        onLongPress={aoPresionarMapa}
        initialRegion={{
          latitude: -15.78,
          longitude: -47.93,
          latitudeDelta: 30,
          longitudeDelta: 30,
        }}
      >
        <UrlTile
          urlTemplate="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          maximumZ={19}
          flipY={false}
        />

        {userCoords && (
          <Marker
            coordinate={{ latitude: userCoords.latitude, longitude: userCoords.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.marcadorUsuario}>
              <View style={styles.marcadorUsuarioMeio} />
            </View>
          </Marker>
        )}

        {destino && (
          <Marker
            coordinate={{ latitude: destino.latitude, longitude: destino.longitude }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <Text style={styles.marcadorDestinoEmoji}>📍</Text>
          </Marker>
        )}

        {destino?.rota?.length > 0 && (
          <Polyline coordinates={destino.rota} strokeColor="#E74C3C" strokeWidth={4} />
        )}
      </MapView>

      {destino && (
        <View style={styles.cardEndereco}>
          <Text style={styles.cardEnderecoTexto} numberOfLines={2}>
            📍 {destino.endereco}
          </Text>
          {carregandoRota && (
            <Text style={styles.cardRotaTexto}>Calculando rota...</Text>
          )}
        </View>
      )}

      {monitorando && (
        <View style={[styles.bannerMonitorando, emAtraso && styles.bannerAtrasado]}>
          <Text style={styles.bannerTitulo}>
            {emAtraso ? "Em atraso — chegada pendente" : "Monitorando percurso"}
          </Text>
          <Text style={styles.bannerTimer}>
            {tempoRestante !== null
              ? `${emAtraso ? "+" : ""}${formatarContagem(tempoRestante)}`
              : "--:--"}
          </Text>
        </View>
      )}

      {!destino && !carregandoRota && (
        <View style={styles.instrucao}>
          <Text style={styles.instrucaoTexto}>
            Pressione e segure o mapa para marcar um destino
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.botaoCentralizar}
        onPress={() => {
          if (userCoords) {
            mapRef.current?.animateToRegion(
              {
                latitude: userCoords.latitude,
                longitude: userCoords.longitude,
                latitudeDelta: LATITUDE_DELTA,
                longitudeDelta: LONGITUDE_DELTA,
              },
              800,
            );
          }
        }}
      >
        <Text style={styles.botaoCentralizarTexto}>🎯</Text>
      </TouchableOpacity>

      {!monitorando && (
        <TouchableOpacity
          style={styles.botaoHistoricoFlutuante}
          onPress={() => setModalHistorico(true)}
        >
          <Text style={styles.botaoHistoricoEmoji}>📋</Text>
          {historico.length > 0 && (
            <View style={styles.badgeHistorico}>
              <Text style={styles.badgeHistoricoTexto}>{historico.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.botoesContainer}>
        {monitorando ? (
          <TouchableOpacity style={styles.botaoCheguei} onPress={confirmarChegada}>
            <Text style={styles.botaoTexto}>Cheguei!</Text>
          </TouchableOpacity>
        ) : (
          destino && !carregandoRota && (
            <TouchableOpacity style={styles.botaoMonitorar} onPress={() => setModalMonitorar(true)}>
              <Text style={styles.botaoTexto}>⏱ Monitorar percurso</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <Modal
        visible={modalMonitorar}
        transparent
        animationType="slide"
        onRequestClose={() => setModalMonitorar(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>⏱ Monitorar percurso</Text>
            <Text style={styles.modalSubtitulo}>
              Defina o tempo para chegar ao destino. Você receberá um alerta quando o prazo esgotar.
            </Text>

            {tempoEstimado > 0 && (
              <View style={styles.estimativaContainer}>
                <Text style={styles.estimativaLabel}>Estimativa da rota</Text>
                <Text style={styles.estimativaValor}>{formatarTempoMin(tempoEstimado)}</Text>
              </View>
            )}

            <Text style={styles.labelTempo}>Tempo selecionado</Text>

            <View style={styles.inputMinutosContainer}>
              <TouchableOpacity
                style={styles.botaoAjusteMin}
                onPress={() => {
                  const atual = parseInt(minutosTexto) || 1;
                  const novo = Math.max(1, atual - 1);
                  setMinutosTexto(String(novo));
                  setTempoSelecionado(novo * 60);
                }}
              >
                <Text style={styles.botaoAjusteMinTexto}>−</Text>
              </TouchableOpacity>

              <TextInput
                style={styles.inputMinutos}
                value={minutosTexto}
                onChangeText={(texto) => {
                  setMinutosTexto(texto);
                  const mins = parseInt(texto);
                  if (!isNaN(mins) && mins >= 1 && mins <= 1440) {
                    setTempoSelecionado(mins * 60);
                  }
                }}
                keyboardType="numeric"
                selectTextOnFocus
                maxLength={4}
              />

              <Text style={styles.inputMinutosLabel}>min</Text>

              <TouchableOpacity
                style={styles.botaoAjusteMin}
                onPress={() => {
                  const atual = parseInt(minutosTexto) || 1;
                  const novo = Math.min(1440, atual + 1);
                  setMinutosTexto(String(novo));
                  setTempoSelecionado(novo * 60);
                }}
              >
                <Text style={styles.botaoAjusteMinTexto}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBotoes}>
              <TouchableOpacity style={styles.modalBotaoCancelar} onPress={() => setModalMonitorar(false)}>
                <Text style={styles.modalBotaoCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBotaoConfirmar} onPress={iniciarMonitoramento}>
                <Text style={styles.modalBotaoConfirmarTexto}>Começar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalHistorico}
        transparent
        animationType="slide"
        onRequestClose={() => setModalHistorico(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.modal, styles.modalHistoricoContainer]}>

            <View style={styles.historicoHeader}>
              <Text style={styles.modalTitulo}>Histórico de percursos</Text>
              <TouchableOpacity onPress={() => setModalHistorico(false)}>
                <Text style={styles.botaoFechar}>✕</Text>
              </TouchableOpacity>
            </View>

            {historico.length === 0 ? (
              <Text style={styles.historicoVazio}>
                Nenhum percurso registrado ainda.{"\n"}
                Monitore um percurso para começar!
              </Text>
            ) : (
              <FlatList
                data={historico}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const diff = item.tempoReal - item.tempoSelecionado;
                  return (
                    <View style={styles.historicoItem}>
                      <View style={styles.historicoItemCorpo}>
                        <Text style={styles.historicoEndereco} numberOfLines={1}>
                          {item.endereco}
                        </Text>
                        <View style={styles.historicoItemLinha}>
                          <Text style={styles.historicoData}>{formatarData(item.data)}</Text>
                          <View style={[styles.badge, item.chegouNoTempo ? styles.badgeSucesso : styles.badgeAtraso]}>
                            <Text style={styles.badgeTexto}>
                              {item.chegouNoTempo ? "No prazo" : "Atrasou"}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.historicoTempos}>
                          <Text style={styles.historicoTempoTexto}>
                            Estimativa da rota: <Text style={styles.historicoTempoValor}>{formatarTempoMin(item.tempoEstimado)}</Text>
                          </Text>
                          <Text style={styles.historicoTempoTexto}>
                            Tempo escolhido: <Text style={styles.historicoTempoValor}>{formatarTempoMin(item.tempoSelecionado)}</Text>
                          </Text>
                          <Text style={styles.historicoTempoTexto}>
                            Tempo real: <Text style={styles.historicoTempoValor}>{formatarTempoMin(item.tempoReal)}</Text>
                            {"  "}
                            <Text style={{ color: diff > 60 ? "#E74C3C" : "#27AE60", fontSize: 11 }}>
                              ({diff > 0 ? "+" : "−"}{formatarTempoMin(Math.abs(diff))})
                            </Text>
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => removerEntrada(item.id)}>
                        <Text style={styles.historicoItemDeletarTexto}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: "100%", height: "100%" },

  marcadorUsuario: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(52, 152, 219, 0.3)",
    borderWidth: 2,
    borderColor: "#3498DB",
    alignItems: "center",
    justifyContent: "center",
  },
  marcadorUsuarioMeio: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3498DB",
  },
  marcadorDestinoEmoji: { fontSize: 32 },

  cardEndereco: {
    position: "absolute",
    top: 48,
    left: 16,
    right: 16,
    backgroundColor: "white",
    borderRadius: 10,
    padding: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  cardCarregando: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardCarregandoTexto: { fontSize: 13, color: "#555" },
  cardEnderecoTexto: { fontSize: 13, color: "#333", lineHeight: 18 },
  cardRotaTexto: { fontSize: 12, color: "#888", marginTop: 4 },

  bannerMonitorando: {
    position: "absolute",
    top: 130,
    left: 16,
    right: 16,
    backgroundColor: "#2C3E50",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    alignItems: "center",
  },
  bannerAtrasado: { backgroundColor: "#C0392B" },
  bannerTitulo: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600" },
  bannerTimer: { color: "#fff", fontSize: 36, fontWeight: "bold", letterSpacing: 3, marginTop: 2 },

  instrucao: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  instrucaoTexto: { color: "#fff", fontSize: 13 },

  botaoCentralizar: {
    position: "absolute",
    right: 16,
    bottom: 100,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  botaoCentralizarTexto: { fontSize: 22 },

  botaoHistoricoFlutuante: {
    position: "absolute",
    left: 16,
    bottom: 100,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  botaoHistoricoEmoji: { fontSize: 22 },
  badgeHistorico: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#E74C3C",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeHistoricoTexto: { color: "#fff", fontSize: 10, fontWeight: "bold" },

  botoesContainer: {
    position: "absolute",
    bottom: 28,
    left: 16,
    right: 16,
    flexDirection: "row",
  },
  botaoMonitorar: {
    flex: 1,
    backgroundColor: "#2C3E50",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  botaoCheguei: {
    flex: 1,
    backgroundColor: "#27AE60",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  botaoTexto: { color: "#fff", fontWeight: "bold", fontSize: 15 },

  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  modalTitulo: { fontSize: 17, fontWeight: "bold", color: "#222", marginBottom: 6 },
  modalSubtitulo: { fontSize: 13, color: "#666", marginBottom: 16, lineHeight: 18 },

  estimativaContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F0F4F8",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  estimativaLabel: { fontSize: 13, color: "#555", fontWeight: "600" },
  estimativaValor: { fontSize: 14, color: "#2C3E50", fontWeight: "bold" },
  labelTempo: { fontSize: 13, color: "#555", fontWeight: "600", textAlign: "center", marginBottom: 12 },
  inputMinutosContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 24,
  },
  botaoAjusteMin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2C3E50",
    alignItems: "center",
    justifyContent: "center",
  },
  botaoAjusteMinTexto: { fontSize: 22, color: "#2C3E50", fontWeight: "600", lineHeight: 26 },
  inputMinutos: {
    width: 90,
    fontSize: 36,
    fontWeight: "bold",
    color: "#2C3E50",
    textAlign: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#2C3E50",
    paddingVertical: 4,
  },
  inputMinutosLabel: { fontSize: 20, color: "#888", fontWeight: "500" },

  modalBotoes: { flexDirection: "row", gap: 10 },
  modalBotaoCancelar: {
    flex: 1,
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  modalBotaoCancelarTexto: { color: "#555", fontWeight: "600", fontSize: 15 },
  modalBotaoConfirmar: {
    flex: 1,
    padding: 13,
    borderRadius: 8,
    backgroundColor: "#2C3E50",
    alignItems: "center",
  },
  modalBotaoConfirmarTexto: { color: "#fff", fontWeight: "bold", fontSize: 15 },

  modalHistoricoContainer: { maxHeight: height * 0.75 },
  historicoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  botaoFechar: { fontSize: 18, color: "#888", padding: 4 },
  historicoVazio: {
    textAlign: "center",
    color: "#aaa",
    fontSize: 14,
    marginTop: 24,
    lineHeight: 22,
  },

  historicoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    gap: 8,
  },
  historicoItemCorpo: { flex: 1 },
  historicoItemLinha: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  historicoEndereco: { fontSize: 14, fontWeight: "600", color: "#222", marginBottom: 4 },
  historicoData: { fontSize: 11, color: "#aaa" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeSucesso: { backgroundColor: "#E8F8F0" },
  badgeAtraso: { backgroundColor: "#FEF0ED" },
  badgeTexto: { fontSize: 11, fontWeight: "600", color: "#333" },
  historicoTempos: {
    backgroundColor: "#F7F9FC",
    borderRadius: 8,
    padding: 10,
    gap: 3,
  },
  historicoTempoTexto: { fontSize: 12, color: "#777" },
  historicoTempoValor: { fontWeight: "600", color: "#333" },
  historicoItemDeletarTexto: { fontSize: 20, paddingLeft: 8 },
});
