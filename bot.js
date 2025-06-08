require('dotenv').config();
if (process.env.RENDER) {
    require('http').createServer((req, res) => {
        res.end('Bot Discord actif');
    }).listen(process.env.PORT || 3000);
}

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');

const TOKEN = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let player = createAudioPlayer();
let resource, connection, stream, volume = 0.5; // 50%
let queue = [];

// Place ceci AVANT le client.on(Events.InteractionCreate, ...) :
const searchResultsMap = new Map();

client.once('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
});

async function playMusic(interaction, url, isNext = false) {
    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) return interaction.reply({ content: 'Tu dois être dans un salon vocal.', ephemeral: true });

    connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
    });

    stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 27 });
    resource = createAudioResource(stream, { inlineVolume: true });
    resource.volume.setVolume(volume); // volume entre 0.1 et 1.0 recommandé

    player.play(resource);
    connection.subscribe(player);

    player.once(AudioPlayerStatus.Idle, async () => {
        if (queue.length > 0) {
            const nextUrl = queue.shift();
            await playMusic(interaction, nextUrl, true);
        } else {
            // Vérifie que la connexion existe et n'est pas déjà détruite
            if (connection && connection.state.status !== 'destroyed') {
                connection.destroy();
            }
        }
    });

    const info = await ytdl.getInfo(url);
    const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(info.videoDetails.title)
        .setURL(url)
        .setDescription(`Lecture en cours par ${interaction.user}`)
        .setThumbnail(info.videoDetails.thumbnails[0].url);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('pause').setLabel('⏸ Pause').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('skip').setLabel('⏭ Skip').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('volup').setLabel('🔊 +').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('voldown').setLabel('🔉 -').setStyle(ButtonStyle.Danger)
        );

    if (!isNext) {
        await interaction.reply({ embeds: [embed], components: [row] });
    } else {
        await interaction.followUp({ embeds: [embed], components: [row] });
    }
}

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'play') {
            const url = interaction.options.getString('url');
            if (!ytdl.validateURL(url)) return interaction.reply({ content: 'Lien YouTube invalide.', ephemeral: true });
            queue = []; // Vide la file d'attente si on relance /play
            await playMusic(interaction, url);
        }
        if (interaction.commandName === 'queue') {
            const url = interaction.options.getString('url');
            if (!ytdl.validateURL(url)) return interaction.reply({ content: 'Lien YouTube invalide.', ephemeral: true });
            queue.push(url);
            await interaction.reply({ content: 'Ajouté à la file d\'attente.', ephemeral: true });
        }
        if (interaction.commandName === 'search') {
            await interaction.deferReply({ ephemeral: true }); // Réserve l'interaction

            const query = interaction.options.getString('query');
            const results = await ytSearch(query);

            if (!results.videos.length) {
                return interaction.editReply({ content: 'Aucun résultat trouvé.' });
            }

            const videos = results.videos.slice(0, 10);

            const rows = [
                new ActionRowBuilder(),
                new ActionRowBuilder()
            ];

            videos.forEach((video, i) => {
                const button = new ButtonBuilder()
                    .setCustomId(`search_play_${i}`)
                    .setLabel(`${i + 1}. ${video.title.substring(0, 70)}`)
                    .setStyle(ButtonStyle.Primary);
                if (i < 5) {
                    rows[0].addComponents(button);
                } else {
                    rows[1].addComponents(button);
                }
            });

            // Stocke les résultats pour ce serveur
            searchResultsMap.set(interaction.guildId, videos);

            await interaction.editReply({
                content: 'Résultats de recherche :',
                components: rows
            });
        }
        if (interaction.commandName === 'leave') {
            const voiceChannel = interaction.guild.members.me.voice.channel;
            if (!voiceChannel) {
                return interaction.reply({ content: 'Je ne suis pas dans un salon vocal.', ephemeral: true });
            }
            queue = [];
            if (connection) connection.destroy();
            await interaction.reply({ content: 'Déconnecté du salon vocal.', ephemeral: true });
        }
    }

    // Gestion du clic sur un bouton de résultat de recherche
    if (interaction.isButton() && interaction.customId.startsWith('search_play_')) {
        const index = parseInt(interaction.customId.replace('search_play_', ''), 10);
        const videos = searchResultsMap.get(interaction.guildId);
        const video = videos?.[index];
        if (!video) return interaction.reply({ content: 'Vidéo introuvable.', ephemeral: true });

        // Si une musique est en cours, on ajoute à la file d'attente, sinon on joue directement
        if (player && player.state.status === AudioPlayerStatus.Playing) {
            queue.push(video.url);
            await interaction.reply({ content: 'Ajouté à la file d\'attente.', ephemeral: true });
        } else {
            queue = [];
            await playMusic(interaction, video.url);
        }
        return; // <-- Ajoute ce return pour ne pas passer au bloc suivant
    }

    // Gestion des autres boutons (pause, skip, etc.)
    if (interaction.isButton()) {
        if (!player || !resource) return interaction.reply({ content: 'Aucune musique en cours.', ephemeral: true });

        switch (interaction.customId) {
            case 'pause':
                if (player.state.status === AudioPlayerStatus.Playing) {
                    player.pause();
                    await interaction.reply({ content: '⏸ Lecture en pause.', ephemeral: true });
                } else {
                    player.unpause();
                    await interaction.reply({ content: '▶️ Lecture reprise.', ephemeral: true });
                }
                break;
            case 'skip':
                player.stop();
                await interaction.reply({ content: '⏭ Musique skip.', ephemeral: true });
                break;
            case 'volup':
                volume = Math.min(volume + 0.1, 2);
                resource.volume.setVolume(volume);
                await interaction.reply({ content: `🔊 Volume: ${(volume * 100).toFixed(0)}%`, ephemeral: true });
                break;
            case 'voldown':
                volume = Math.max(volume - 0.1, 0);
                resource.volume.setVolume(volume);
                await interaction.reply({ content: `🔉 Volume: ${(volume * 100).toFixed(0)}%`, ephemeral: true });
                break;
        }
    }
});

client.login(TOKEN);