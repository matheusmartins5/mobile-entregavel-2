# Monitoramento de Percurso
App mobile desenvolvido em React Native com Expo para monitorar o tempo de deslocamento até um destino.

## O que faz
O usuário pressiona e segura o mapa para marcar um destino. O app calcula a rota até esse ponto, busca o endereço pelo nome e exibe uma contagem regressiva configurável. Ao chegar, o usuário confirma a chegada e o percurso é salvo no histórico com informações de tempo estimado, tempo escolhido e tempo real.

## Fluxo do APP
1. Pressionar e segurar um ponto no mapa para marcar o destino
2. O app busca o endereço e calcula a rota até o local
3. Clique Monitor Percurso, ajustar o tempo desejado e tocar em "Começar"
4. Acompanhar a contagem regressiva durante o trajeto
5. Caso passe o tempo que foi desejado, é emitido uma notificação e uma vibração no dispositivo
6. Quando chegar do destino, clique em "Cheguei!" e o percurso será salvo no histórico

OBS: Futuramente poderia ser configurado para caso ultrapasse o tempo estimado, enviasse um SMS ou uma mensagem para alguém de referência.

## Problema real
Foi pensado em uma solução para uma segurança adicional às pessoas. Situações como ir a pé para casa à noite, se deslocar sozinho para um local desconhecido ou simplesmente avisar alguém que chegou bem são comuns no dia a dia. O app permite que o usuário defina um tempo esperado para chegar ao destino e seja alertado caso ultrapasse esse prazo, servindo como um lembrete ativo de que algo pode ter dado errado no trajeto.