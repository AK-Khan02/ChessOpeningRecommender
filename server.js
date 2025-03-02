const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = 5000;

app.use(cors());

// Chess.com API endpoints
const CHESS_COM_API = 'https://api.chess.com/pub/player';

app.get('/api/recommendations/:username', async (req, res) => {
  const username = req.params.username;
  const playerColor = req.query.color || 'white';

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    // Verify user exists on chess.com
    const userResponse = await axios.get(`${CHESS_COM_API}/${username}`);
    if (!userResponse.data) {
      return res.status(404).json({ error: 'User not found on chess.com' });
    }

    // Get user's games stats
    const statsResponse = await axios.get(`${CHESS_COM_API}/${username}/stats`);
    
    // Try to get rating from various time controls, defaulting to 1500 if none found
    const rating = statsResponse.data.chess_rapid?.last?.rating || 
                  statsResponse.data.chess_blitz?.last?.rating ||
                  statsResponse.data.chess_bullet?.last?.rating ||
                  statsResponse.data.chess_daily?.last?.rating ||
                  1500;

    // Get openings data based on rating and color
    const openingsData = generateOpeningsData(rating, playerColor);
    const recommendedOpening = recommendOpening(openingsData, rating);

    res.json({
      rating,
      recommendedOpening,
      openingsData
    });
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response?.status === 404) {
      res.status(404).json({ error: 'User not found on chess.com' });
    } else {
      res.status(500).json({ error: 'Failed to fetch chess.com data' });
    }
  }
});

function generateOpeningsData(rating, playerColor) {
  const openings = {
    white: {
      beginner: [
        { opening: "Italian Game", baseWinRate: 55 },
        { opening: "London System", baseWinRate: 54 },
        { opening: "King's Pawn Opening", baseWinRate: 52 },
        { opening: "Queen's Gambit", baseWinRate: 51 },
        { opening: "Scotch Game", baseWinRate: 53 }
      ],
      intermediate: [
        { opening: "Ruy Lopez", baseWinRate: 56 },
        { opening: "Queen's Gambit", baseWinRate: 55 },
        { opening: "English Opening", baseWinRate: 54 },
        { opening: "Vienna Game", baseWinRate: 53 },
        { opening: "Scotch Game", baseWinRate: 54 }
      ],
      advanced: [
        { opening: "Ruy Lopez", baseWinRate: 58 },
        { opening: "Catalan Opening", baseWinRate: 57 },
        { opening: "English Opening", baseWinRate: 56 },
        { opening: "Queen's Gambit", baseWinRate: 56 },
        { opening: "King's Indian Attack", baseWinRate: 55 }
      ]
    },
    black: {
      beginner: [
        { opening: "King's Indian Defense", baseWinRate: 53 },
        { opening: "Sicilian Defense", baseWinRate: 52 },
        { opening: "French Defense", baseWinRate: 54 },
        { opening: "Caro-Kann Defense", baseWinRate: 53 },
        { opening: "Pirc Defense", baseWinRate: 51 }
      ],
      intermediate: [
        { opening: "Sicilian Defense", baseWinRate: 55 },
        { opening: "French Defense", baseWinRate: 54 },
        { opening: "Nimzo-Indian Defense", baseWinRate: 54 },
        { opening: "King's Indian Defense", baseWinRate: 53 },
        { opening: "Caro-Kann Defense", baseWinRate: 53 }
      ],
      advanced: [
        { opening: "Sicilian Defense", baseWinRate: 57 },
        { opening: "Nimzo-Indian Defense", baseWinRate: 56 },
        { opening: "Grünfeld Defense", baseWinRate: 55 },
        { opening: "King's Indian Defense", baseWinRate: 55 },
        { opening: "Queen's Indian Defense", baseWinRate: 54 }
      ]
    }
  };

  let level = rating < 1400 ? 'beginner' : rating < 1800 ? 'intermediate' : 'advanced';
  let selectedOpenings = openings[playerColor][level];

  return selectedOpenings.map(opening => ({
    opening: opening.opening,
    winRate: opening.baseWinRate  // Add some randomness ±3%
  }));
}

function recommendOpening(openingsData, rating) {
  // Find the opening with the highest win rate
  const bestOpening = openingsData.reduce((prev, curr) => 
    curr.winRate > prev.winRate ? curr : prev
  );

  return bestOpening.opening;
}

app.get('/api/games/:username', async (req, res) => {
  const username = req.params.username;
  const dateFilter = req.query.date || '';

  try {
    // First verify the user exists
    try {
      await axios.get(`${CHESS_COM_API}/${username}`);
    } catch (error) {
      if (error.response?.status === 404) {
        return res.status(404).json({ error: 'User not found on chess.com' });
      }
      throw error;
    }

    // Get archives URLs
    const archivesResponse = await axios.get(`${CHESS_COM_API}/${username}/games/archives`);
    if (!archivesResponse.data || !archivesResponse.data.archives || archivesResponse.data.archives.length === 0) {
      return res.status(404).json({ error: 'No games found for this user' });
    }

    const allArchives = archivesResponse.data.archives;
    let archivesToFetch = [];

    // Sort archives in reverse chronological order
    allArchives.sort().reverse();

    if (dateFilter.match(/^\d{4}$/)) {
      // Year only (YYYY)
      archivesToFetch = allArchives.filter(archive => archive.includes(`/${dateFilter}/`));
    } else if (dateFilter.match(/^\d{4}-\d{2}$/)) {
      // Year and month (YYYY-MM)
      const [year, month] = dateFilter.split('-');
      archivesToFetch = allArchives.filter(archive => archive.includes(`/${year}/${month}`));
    } else if (dateFilter.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Specific date (YYYY-MM-DD)
      const [year, month] = dateFilter.split('-');
      archivesToFetch = allArchives.filter(archive => archive.includes(`/${year}/${month}`));
    } else {
      // Default to most recent month
      archivesToFetch = [allArchives[0]];
    }

    if (archivesToFetch.length === 0) {
      return res.json({ games: [] });
    }

    // Limit the number of archives to prevent timeout
    const MAX_ARCHIVES = 3;
    archivesToFetch = archivesToFetch.slice(0, MAX_ARCHIVES);

    // Fetch games from each archive
    const gamePromises = archivesToFetch.map(archive => 
      axios.get(archive)
        .then(response => {
          if (!response.data || !response.data.games) return [];
          return response.data.games;
        })
        .catch(error => {
          console.error(`Error fetching archive ${archive}:`, error.message);
          return [];
        })
    );

    const gamesArrays = await Promise.all(gamePromises);
    let allGames = gamesArrays.flat();

    // Filter by specific date if provided
    if (dateFilter.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const targetDate = new Date(dateFilter);
      targetDate.setHours(0, 0, 0, 0);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);

      allGames = allGames.filter(game => {
        const gameDate = new Date(game.end_time * 1000);
        return gameDate >= targetDate && gameDate < nextDate;
      });
    }

    // Sort games by date (most recent first)
    allGames.sort((a, b) => b.end_time - a.end_time);

    // Limit the number of games to prevent overwhelming the client
    const MAX_GAMES = 50;
    allGames = allGames.slice(0, MAX_GAMES);

    res.json({ games: allGames });
  } catch (error) {
    console.error('Error fetching games:', error);
    const errorMessage = error.response?.status === 404 
      ? 'User not found on chess.com'
      : 'Failed to fetch chess.com data';
    res.status(error.response?.status || 500).json({ error: errorMessage });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
