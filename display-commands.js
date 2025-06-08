const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const CLIENT_ID = '1381351289275027517'; // Remplace par l'ID de ton application
const GUILD_ID = '1310683141962334309';   // Remplace par l'ID de ton serveur (pour local)
const TOKEN = process.env.DISCORD_TOKEN;

// Définis tes commandes ici
const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Renvoie Pong!'),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Joue une musique depuis YouTube')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('Lien YouTube à jouer')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Ajoute une musique à la file d\'attente')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('Lien YouTube à ajouter à la file')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('search')
        .setDescription('Recherche une musique sur YouTube')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Mots-clés à rechercher')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Déconnecte le bot du salon vocal'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// Pour enregistrer les commandes globales (disponibles partout)
async function registerGlobal() {
    try {
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Slash commands globales enregistrées.');
    } catch (error) {
        console.error(error);
    }
}

// Pour enregistrer les commandes locales (pour un serveur spécifique)
async function registerGuild() {
    try {
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log('✅ Slash commands locales enregistrées.');
    } catch (error) {
        console.error(error);
    }
}

// Décommente la fonction que tu veux utiliser :

registerGlobal(); // Pour global
registerGuild();  // Pour local