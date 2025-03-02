import Chart from 'chart.js/auto';

const submitBtn = document.getElementById('submit-btn');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error-message');
const resultsEl = document.getElementById('results');
const colorSelect = document.getElementById('color-select');
const filterBtn = document.getElementById('filter-btn');
const dateFilterInput = document.getElementById('date-filter');

let currentUsername = '';
let currentGames = []; // Store the current games data

function showLoading() {
  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  resultsEl.style.display = 'none';
  submitBtn.disabled = true;
}

function hideLoading() {
  loadingEl.style.display = 'none';
  submitBtn.disabled = false;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  resultsEl.style.display = 'none';
}

function showResults() {
  resultsEl.style.display = 'block';
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getGameResult(game, username) {
  if (!game || !game.white || !game.black) return 'unknown';
  
  const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
  const playerData = isWhite ? game.white : game.black;
  
  if (playerData.result === 'win') return 'win';
  if (playerData.result === 'checkmated' || 
      playerData.result === 'resigned' || 
      playerData.result === 'timeout' || 
      playerData.result === 'abandoned') return 'loss';
  return 'draw';
}

// Filter event listeners
document.getElementById('result-filter').addEventListener('change', function() {
  filterGames();
});

document.getElementById('color-filter').addEventListener('change', function() {
  filterGames();
});

function filterGames() {
  let filteredGames = [...currentGames];
  const resultFilter = document.getElementById('result-filter').value;
  const colorFilter = document.getElementById('color-filter').value;
  
  // Apply result filter
  if (resultFilter !== 'all') {
    filteredGames = filteredGames.filter(game => getGameResult(game, currentUsername) === resultFilter);
  }
  
  // Apply color filter
  if (colorFilter !== 'all') {
    filteredGames = filteredGames.filter(game => {
      const playerIsWhite = game.white.username.toLowerCase() === currentUsername.toLowerCase();
      return (colorFilter === 'white' && playerIsWhite) || (colorFilter === 'black' && !playerIsWhite);
    });
  }
  
  displayGames(filteredGames);
}

function displayGames(games) {
  const gamesListEl = document.getElementById('games-list');
  
  if (!games || games.length === 0) {
    gamesListEl.innerHTML = '<div class="no-games">No games found matching the filters</div>';
    return;
  }

  gamesListEl.innerHTML = games.map(game => {
    try {
      const result = getGameResult(game, currentUsername);
      const playerIsWhite = game.white.username.toLowerCase() === currentUsername.toLowerCase();
      const playerColor = playerIsWhite ? 'White' : 'Black';
      const playerData = playerIsWhite ? game.white : game.black;
      const opponentData = playerIsWhite ? game.black : game.white;
      const timeControl = game.time_class || 'Unknown';

      return `
        <div class="game-card">
          <div class="game-result ${result}">${result.toUpperCase()}</div>
          <div class="game-details">
            <div>
              Playing as ${playerColor} (${playerData.rating || '?'}) 
              vs ${opponentData.username} (${opponentData.rating || '?'})
              • ${timeControl}
            </div>
            <div class="game-date">${formatDate(game.end_time * 1000)}</div>
          </div>
          <a href="${game.url}" target="_blank" class="game-link">View Game</a>
        </div>
      `;
    } catch (err) {
      console.error('Error processing game:', err, game);
      return ''; // Skip invalid games
    }
  }).filter(html => html !== '').join('');
}

async function fetchAndDisplayGames(username, dateFilter = '') {
  const gamesListEl = document.getElementById('games-list');
  gamesListEl.innerHTML = '<div class="loading">Loading games...</div>';

  try {
    const response = await fetch(`http://localhost:5000/api/games/${encodeURIComponent(username)}?date=${dateFilter}`);
    if (!response.ok) {
      throw new Error(response.status === 404 ? 'No games found for this user' : 'Failed to fetch games');
    }
    
    const data = await response.json();
    currentGames = data.games; // Store the games
    filterGames(); // Apply current filters
  } catch (error) {
    console.error('Error fetching games:', error);
    gamesListEl.innerHTML = `<div class="error-message">Failed to load games: ${error.message}</div>`;
  }
}

function getRatingCategory(rating) {
  if (rating < 1200) return 'Beginner';
  if (rating < 1400) return 'Intermediate';
  if (rating < 1600) return 'Advanced';
  if (rating < 1800) return 'Expert';
  if (rating < 2000) return 'Master';
  return 'Grandmaster';
}

function updateResources(playerColor, rating) {
  const resourceList = document.getElementById('resource-list');
  resourceList.innerHTML = '';
  
  const resources = [
    {
      title: 'Chess.com Opening Explorer',
      url: 'https://www.chess.com/openings'
    },
    {
      title: `${playerColor === 'white' ? 'White' : 'Black'} Opening Fundamentals`,
      url: `https://www.chess.com/lessons/playing-${playerColor}`
    },
    {
      title: 'Lichess Opening Practice',
      url: 'https://lichess.org/practice'
    }
  ];

  resources.forEach(resource => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = resource.url;
    a.target = '_blank';
    a.textContent = resource.title;
    li.appendChild(a);
    resourceList.appendChild(li);
  });
}

// Add CSS styles for the result colors
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  .game-result.win { color: #4CAF50; }  /* Green */
  .game-result.draw { color: #9E9E9E; }  /* Grey */
  .game-result.loss { color: #F44336; }  /* Red */
  .game-result { 
    font-size: 1.2em;
    font-weight: bold;
    margin-bottom: 8px;
  }
`;
document.head.appendChild(styleSheet);

submitBtn.addEventListener('click', async () => {
  const usernameInput = document.getElementById('username');
  const username = usernameInput.value.trim();
  const playerColor = colorSelect.value;
  
  if (!username) {
    showError('Please enter a valid chess.com username.');
    return;
  }

  currentUsername = username;
  showLoading();

  try {
    const response = await fetch(`http://localhost:5000/api/recommendations/${encodeURIComponent(username)}?color=${playerColor}`);
    if (!response.ok) {
      throw new Error(response.status === 404 ? 'Username not found on chess.com' : 'Failed to fetch recommendations');
    }
    const data = await response.json();

    // Update user stats
    document.getElementById('user-rating').textContent = data.rating;
    const category = getRatingCategory(data.rating);
    document.getElementById('rating-category').textContent = category;

    // Display the recommended openings
    const recommendationEl = document.getElementById('recommendation');
    recommendationEl.innerHTML = `
      <h3>Recommended Openings for ${playerColor === 'white' ? 'White' : 'Black'}</h3>
      <div class="stat-value">${data.recommendedOpening}</div>
      <small>Based on your rating (${data.rating}) and playing style</small>
    `;

    // Update resources
    updateResources(playerColor, data.rating);

    // Visualize the openings data using Chart.js
    const ctx = document.getElementById('chart').getContext('2d');
    const labels = data.openingsData.map(item => item.opening);
    const winRates = data.openingsData.map(item => item.winRate);
    
    // Remove old chart instance if any
    if (window.myChart) {
      window.myChart.destroy();
    }

    window.myChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Win Rate (%)',
          data: winRates,
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          borderColor: 'rgba(0, 0, 0, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Opening Win Rates',
            color: '#000000'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: 'Win Rate (%)',
              color: '#000000'
            }
          },
          x: {
            ticks: {
              color: '#000000'
            }
          }
        }
      }
    });

    showResults();
    // Fetch initial games
    await fetchAndDisplayGames(username);
  } catch (error) {
    showError(error.message);
  } finally {
    hideLoading();
  }
});

filterBtn.addEventListener('click', () => {
  if (!currentUsername) {
    showError('Please search for a user first');
    return;
  }
  
  const dateFilter = dateFilterInput.value.trim();
  if (dateFilter && !dateFilter.match(/^\d{4}(-\d{2}(-\d{2})?)?$/)) {
    showError('Please enter a valid date format (YYYY-MM-DD, YYYY-MM, or YYYY)');
    return;
  }
  
  fetchAndDisplayGames(currentUsername, dateFilter);
});
