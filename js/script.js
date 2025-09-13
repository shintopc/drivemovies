// Your opensheet URLs
const GOOGLE_SHEET_URL_MOVIES = 'https://opensheet.elk.sh/1vOt2lrRXqEnX8m9AclIAtBP67Wwn7kLqj0htmjVQWEw/movies';
const GOOGLE_SHEET_URL_WEBSERIES = 'https://opensheet.elk.sh/1vOt2lrRXqEnX8m9AclIAtBP67Wwn7kLqj0htmjVQWEw/webseries'; // Replace with your webseries sheet URL/name

// App state
let movies = [];
let webseries = [];
let filteredMovies = [];
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed')) || [];
let deferredPrompt = null;

// DOM elements
const moviesGrid = document.getElementById('moviesGrid');
const webseriesGrid = document.getElementById('webseriesGrid');
const favoritesGrid = document.getElementById('favoritesGrid');
const recentlyPlayedGrid = document.getElementById('recentlyPlayedGrid');
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const genreFilter = document.getElementById('genreFilter');
const languageFilter = document.getElementById('languageFilter');
const videoPlayerContainer = document.getElementById('videoPlayerContainer');
const videoFrame = document.getElementById('videoFrame');
const closePlayer = document.getElementById('closePlayer');
const installButton = document.getElementById('installButton');
const favoritesSection = document.getElementById('favoritesSection');
const recentlyPlayedSection = document.getElementById('recentlyPlayedSection');

// Go to homepage function
function goToHome() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    searchInput.value = '';
    clearSearch.style.display = 'none';
    genreFilter.value = '';
    languageFilter.value = '';
    filterMovies();
}

// Initialize the app
document.addEventListener('DOMContentLoaded', init);

function init() {
    loadMovies();
    loadWebseries(); // Load webseries data
    setupEventListeners();
    checkPWAInstallable();
    renderFavorites();
    renderRecentlyPlayed();
    setupOrientationHandling();
    
    // Register service worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                    console.log('SW registered: ', registration);
                })
                .catch((registrationError) => {
                    console.log('SW registration failed: ', registrationError);
                });
        });
    }
}

// Fetch movies from Google Sheet
async function loadMovies() {
    try {
        moviesGrid.innerHTML = '<div class="spinner"></div>';
        
        const response = await fetch(GOOGLE_SHEET_URL_MOVIES);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        movies = await response.json();
        
        // Process movies data
        movies = movies.map(movie => ({
            ...movie,
            poster: movie.poster && isValidUrl(movie.poster) 
                ? movie.poster 
                : 'https://via.placeholder.com/300x450/1e1e1e/ffffff?text=No+Poster',
            genre: movie.genre ? movie.genre.split(',').map(g => g.trim()) : [],
            language: movie.language ? movie.language.split(',').map(l => l.trim()) : []
        }));
        
        filteredMovies = [...movies];
        
        renderMovies();
        populateGenreFilter();
        populateLanguageFilter();
        renderHeaderMarquee();
        
    } catch (error) {
        console.error('Error loading movies:', error);
        moviesGrid.innerHTML = '<div class="empty-state">Error loading movies. Please try again later.</div>';
    }
}

// Fetch webseries from Google Sheet
async function loadWebseries() {
    try {
        webseriesGrid.innerHTML = '<div class="spinner"></div>';
        const response = await fetch(GOOGLE_SHEET_URL_WEBSERIES);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const rawData = await response.json();
        
        // Group flat episode data into a structured series format
        const groupedSeries = rawData.reduce((acc, item) => {
            if (!item.title || !item.season || !item.episodeTitle || !item.fileId) return acc;
            
            let series = acc[item.title];
            if (!series) {
                series = {
                    title: item.title,
                    description: item.description,
                    poster: item.poster && isValidUrl(item.poster) 
                        ? item.poster 
                        : 'https://via.placeholder.com/300x450/1e1e1e/ffffff?text=No+Poster',
                    genre: item.genre ? item.genre.split(',').map(g => g.trim()) : [],
                    language: item.language ? item.language.split(',').map(l => l.trim()) : [],
                    seasons: {}
                };
                acc[item.title] = series;
            }

            let season = series.seasons[item.season];
            if (!season) {
                season = { seasonNumber: item.season, episodes: [] };
                series.seasons[item.season] = season;
            }

            season.episodes.push({ episodeTitle: item.episodeTitle, fileId: item.fileId });
            return acc;
        }, {});

        // Convert grouped object into an array and sort seasons
        webseries = Object.values(groupedSeries).map(series => ({
            ...series,
            seasons: Object.values(series.seasons).sort((a, b) => a.seasonNumber - b.seasonNumber)
        }));

        renderWebseries();

    } catch (error) {
        console.error('Error loading webseries:', error);
        webseriesGrid.innerHTML = '<div class="empty-state">Error loading webseries. Please try again later.</div>';
    }
}


// Render header marquee with latest movies
function renderHeaderMarquee() {
    const headerMarquee = document.getElementById('headerMarquee');
    if (!headerMarquee) return;

    // Take last 3 movies (or fewer if less available)
    const latestMovies = movies.slice(-3);

    if (latestMovies.length === 0) {
        headerMarquee.innerHTML = `<div class="header-marquee-text">🎬 💫Welcome to DriveFlix💫 🎉</div>`;
        return;
    }

    // Build marquee text items with fixed welcome message first
    let marqueeHTML = `<div class="header-marquee-text">🌟💫 Welcome to DriveFlix 💫🎬 : Newly Added Movies : </div>`;
    
    // Add only the 3 latest movies without "Newly Added" text
    marqueeHTML += latestMovies.map(movie => `
        <div class="header-marquee-text">✨ <span>${movie.title}</span></div>
    `).join('');
    
    headerMarquee.innerHTML = marqueeHTML;
}

// Check if a string is a valid URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Render movies to the grid
function renderMovies() {
    if (filteredMovies.length === 0) {
        moviesGrid.innerHTML = '<div class="empty-state">No movies found. Try a different search.</div>';
        return;
    }
    
    moviesGrid.innerHTML = filteredMovies.map(movie => `
        <div class="movie-card">
            <img src="${movie.poster}" alt="${movie.title}" class="movie-poster" onerror="this.src='https://via.placeholder.com/300x450/1e1e1e/ffffff?text=No+Poster'">
            <div class="movie-info">
                <h3 class="movie-title">${movie.title}</h3>
                <div class="movie-info-badges">
                    ${movie.genre && movie.genre.length > 0 ? 
                        `<div class="movie-genre">${movie.genre[0]}</div>` : ''}
                    ${movie.language && movie.language.length > 0 ? 
                        `<div class="movie-language">${movie.language[0]}</div>` : ''}
                </div>
                <p class="movie-description">${movie.description || 'No description available'}</p>
                <div class="movie-actions">
                    <button class="btn btn-play" onclick="playMovie('${movie.fileId}')">
                        ▶ Play
                    </button>
                    <button class="btn btn-favorite ${favorites.includes(movie.fileId) ? 'active' : ''}" 
                        onclick="toggleFavorite('${movie.fileId}')">
                        ♥
                    </button>
                    <a href="https://drive.google.com/uc?export=download&id=${movie.fileId}" 
                       class="btn btn-download" download>
                        ⬇
                    </a>
                </div>
            </div>
        </div>
    `).join('');
}

// Render webseries to the grid
function renderWebseries() {
    if (webseries.length === 0) {
        webseriesGrid.innerHTML = '<div class="empty-state">No webseries found.</div>';
        return;
    }

    webseriesGrid.innerHTML = webseries.map(series => `
        <div class="webseries-card">
            <img src="${series.poster}" alt="${series.title}" class="webseries-poster" onerror="this.src='https://via.placeholder.com/300x450/1e1e1e/ffffff?text=No+Poster'">
            <div class="webseries-info">
                <h3 class="webseries-title">${series.title}</h3>
                <div class="movie-info-badges">
                    ${series.genre && series.genre.length > 0 ? `<div class="movie-genre">${series.genre[0]}</div>` : ''}
                    ${series.language && series.language.length > 0 ? `<div class="movie-language">${series.language[0]}</div>` : ''}
                </div>
                <p class="webseries-description">${series.description || 'No description available'}</p>
                <div class="seasons-container">
                    ${series.seasons.map(season => `
                        <details class="season-accordion">
                            <summary class="season-header">Season ${season.seasonNumber}</summary>
                            <ul class="episode-list">
                                ${season.episodes.map(episode => `
                                    <li class="episode-item">
                                        <span>${episode.episodeTitle}</span>
                                        <button class="btn btn-play-episode" onclick="playMovie('${episode.fileId}')">▶</button>
                                    </li>
                                `).join('')}
                            </ul>
                        </details>
                    `).join('')}
                </div>
            </div>
        </div>
    `).join('');
}


// Render favorite movies
function renderFavorites() {
    const favoriteMovies = movies.filter(movie => favorites.includes(movie.fileId));
    
    if (favoriteMovies.length === 0) {
        favoritesSection.style.display = 'none';
        return;
    }
    
    favoritesSection.style.display = 'block';
    favoritesGrid.innerHTML = favoriteMovies.map(movie => `
        <div class="movie-card" data-id="${movie.fileId}">
            <img src="${movie.poster}" alt="${movie.title}" class="movie-poster" onerror="this.src='https://via.placeholder.com/300x450/1e1e1e/ffffff?text=No+Poster'">
            <div class="movie-info">
                <h3 class="movie-title">${movie.title}</h3>
                <div class="movie-info-badges">
                    ${movie.genre && movie.genre.length > 0 ? 
                        `<div class="movie-genre">${movie.genre[0]}</div>` : ''}
                    ${movie.language && movie.language.length > 0 ? 
                        `<div class="movie-language">${movie.language[0]}</div>` : ''}
                </div>
                <p class="movie-description">${movie.description || 'No description available'}</p>
                <div class="movie-actions">
                    <button class="btn btn-play" onclick="playMovie('${movie.fileId}')">
                        ▶ Play
                    </button>
                    <button class="btn btn-favorite active" onclick="toggleFavorite('${movie.fileId}')">
                        ♥
                    </button>
                    <a href="https://drive.google.com/uc?export=download&id=${movie.fileId}" 
                       class="btn btn-download" download>
                        ⬇
                    </a>
                </div>
            </div>
        </div>
    `).join('');
}

// Render recently played movies
function renderRecentlyPlayed() {
    const recentlyPlayedMovies = recentlyPlayed
        .map(id => movies.find(movie => movie.fileId === id))
        .filter(movie => movie !== undefined);
    
    if (recentlyPlayedMovies.length === 0) {
        recentlyPlayedSection.style.display = 'none';
        return;
    }
    
    recentlyPlayedSection.style.display = 'block';
    recentlyPlayedGrid.innerHTML = recentlyPlayedMovies.map(movie => `
        <div class="movie-card" data-id="${movie.fileId}">
            <img src="${movie.poster}" alt="${movie.title}" class="movie-poster" onerror="this.src='https://via.placeholder.com/300x450/1e1e1e/ffffff?text=No+Poster'">
            <div class="movie-info">
                <h3 class="movie-title">${movie.title}</h3>
                <div class="movie-info-badges">
                    ${movie.genre && movie.genre.length > 0 ? 
                        `<div class="movie-genre">${movie.genre[0]}</div>` : ''}
                    ${movie.language && movie.language.length > 0 ? 
                        `<div class="movie-language">${movie.language[0]}</div>` : ''}
                </div>
                <p class="movie-description">${movie.description || 'No description available'}</p>
                <div class="movie-actions">
                    <button class="btn btn-play" onclick="playMovie('${movie.fileId}')">
                        ▶ Play
                    </button>
                    <button class="btn btn-favorite ${favorites.includes(movie.fileId) ? 'active' : ''}" 
                        onclick="toggleFavorite('${movie.fileId}')">
                        ♥
                    </button>
                    <a href="https://drive.google.com/uc?export=download&id=${movie.fileId}" 
                       class="btn btn-download" download>
                        ⬇
                    </a>
                </div>
            </div>
        </div>
    `).join('');
}

// Populate genre filter dropdown
function populateGenreFilter() {
    const allGenres = movies.flatMap(movie => movie.genre);
    const uniqueGenres = [...new Set(allGenres)].filter(genre => genre);
    
    while (genreFilter.options.length > 1) {
        genreFilter.remove(1);
    }
    
    uniqueGenres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        genreFilter.appendChild(option);
    });
}

// Populate language filter dropdown
function populateLanguageFilter() {
    const allLanguages = movies.flatMap(movie => movie.language);
    const uniqueLanguages = [...new Set(allLanguages)].filter(language => language);
    
    while (languageFilter.options.length > 1) {
        languageFilter.remove(1);
    }
    
    uniqueLanguages.forEach(language => {
        const option = document.createElement('option');
        option.value = language;
        option.textContent = language;
        languageFilter.appendChild(option);
    });
}

// Play a movie or episode
function playMovie(fileId) {
    if (!fileId) return;
    
    // Attempt to find the item in movies first to add to recently played
    const movie = movies.find(m => m.fileId === fileId);
    if (movie) {
        addToRecentlyPlayed(fileId);
    }
    
    const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    videoFrame.src = embedUrl;
    
    videoPlayerContainer.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    if (window.screen.orientation && window.screen.orientation.lock) {
        try {
            window.screen.orientation.lock('landscape').catch(() => {});
        } catch (error) {
            console.log('Orientation lock not supported');
        }
    }
}

// Add movie to recently played
function addToRecentlyPlayed(fileId) {
    recentlyPlayed = recentlyPlayed.filter(id => id !== fileId);
    recentlyPlayed.unshift(fileId);
    recentlyPlayed = recentlyPlayed.slice(0, 5);
    localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
    renderRecentlyPlayed();
}

// Toggle favorite status
function toggleFavorite(fileId) {
    if (favorites.includes(fileId)) {
        favorites = favorites.filter(id => id !== fileId);
    } else {
        favorites.push(fileId);
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));
    renderMovies();
    renderFavorites();
    renderRecentlyPlayed();
}

// Filter movies
function filterMovies() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedGenre = genreFilter.value;
    const selectedLanguage = languageFilter.value;
    
    filteredMovies = movies.filter(movie => {
        const matchesSearch = movie.title.toLowerCase().includes(searchTerm) || 
                            (movie.description && movie.description.toLowerCase().includes(searchTerm));
        const matchesGenre = !selectedGenre || (movie.genre && movie.genre.includes(selectedGenre));
        const matchesLanguage = !selectedLanguage || (movie.language && movie.language.includes(selectedLanguage));
        return matchesSearch && matchesGenre && matchesLanguage;
    });
    
    // Note: This filter currently only applies to movies.
    // Filtering webseries would require additional logic.
    renderMovies();
}

// Setup orientation handling
function setupOrientationHandling() {
    const handleOrientationChange = () => {
        if (window.innerHeight > window.innerWidth) {
            if (videoPlayerContainer.classList.contains('active')) {}
        }
    };
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);
}

// Check if PWA is installable
function checkPWAInstallable() {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        installButton.style.display = 'none';
        return;
    }
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
        installButton.style.display = 'flex';
        installButton.setAttribute('title', 'Tap for iOS install instructions');
    }
}

// Setup event listeners
function setupEventListeners() {
    searchInput.addEventListener('input', () => {
        clearSearch.style.display = searchInput.value ? 'block' : 'none';
        filterMovies();
    });
    
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        clearSearch.style.display = 'none';
        filterMovies();
    });
    
    genreFilter.addEventListener('change', filterMovies);
    languageFilter.addEventListener('change', filterMovies);
    
    const closeVideoPlayer = () => {
        videoPlayerContainer.classList.remove('active');
        videoFrame.src = '';
        document.body.style.overflow = 'auto';
        if (window.screen.orientation && window.screen.orientation.unlock) {
            try {
                window.screen.orientation.unlock();
            } catch (error) {}
        }
    };
    
    closePlayer.addEventListener('click', closeVideoPlayer);
    videoPlayerContainer.addEventListener('click', (e) => {
        if (e.target === videoPlayerContainer) {
            closeVideoPlayer();
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && videoPlayerContainer.classList.contains('active')) {
            closeVideoPlayer();
        }
    });
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (!isIOS) {
            installButton.style.display = 'flex';
        }
    });
    
    installButton.addEventListener('click', async () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            alert('To install this app on iOS:\n1. Tap the Share button\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add"');
            return;
        }
        
        if (!deferredPrompt) {
            alert('To install this app, use the "Add to Home Screen" option in your browser menu.');
            return;
        }
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installButton.style.display = 'none';
        }
        deferredPrompt = null;
    });
    
    window.addEventListener('appinstalled', () => {
        installButton.style.display = 'none';
        deferredPrompt = null;
    });
}
