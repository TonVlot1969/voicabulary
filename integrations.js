/**
 * Integrations for Voicabulary
 * Handles Calendar Links and Web Share API
 */

function generateCalendarLink(days, hour, minute) {
    const title = encodeURIComponent("Voicabulary Lesson");
    const details = encodeURIComponent(`Time for your daily English practice! \n\nOpen the app here: ${window.location.href}`);
    
    // Create base date for tomorrow to avoid immediate past events
    const now = new Date();
    // Use proper recurrence formatting for Google Calendar
    
    // Let's create a generic recurring link without strict start times, 
    // relying on the RRULE to define the days and local time zone.
    const startHourStr = String(hour).padStart(2, '0');
    const startMinuteStr = String(minute).padStart(2, '0');
    
    let endHour = parseInt(hour);
    let endMinute = parseInt(minute) + 30;
    if (endMinute >= 60) {
        endHour++;
        endMinute -= 60;
    }
    const endHourStr = String(endHour).padStart(2, '0');
    const endMinuteStr = String(endMinute).padStart(2, '0');
    
    // Format YYYYMMDDTHHMMSS in user local time without Z
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    
    const startTimeStr = `${yyyy}${mm}${dd}T${startHourStr}${startMinuteStr}00`;
    const endTimeStr = `${yyyy}${mm}${dd}T${endHourStr}${endMinuteStr}00`;
    
    const dates = `${startTimeStr}/${endTimeStr}`;
    const recur = `RRULE:FREQ=WEEKLY;BYDAY=${days}`;
    
    return `https://calendar.google.com/calendar/r/eventedit?text=${title}&details=${details}&dates=${dates}&recur=${recur}`;
}

function setupCalendarButtons() {
    const btnMonWed = document.getElementById('cal-mon-wed');
    const btnTueThuFri = document.getElementById('cal-tue-thu-fri');
    
    if (btnMonWed) {
        btnMonWed.addEventListener('click', () => {
            const url = generateCalendarLink('MO,WE', '07', '30');
            window.open(url, '_blank');
        });
    }
    
    if (btnTueThuFri) {
        btnTueThuFri.addEventListener('click', () => {
            const url = generateCalendarLink('TU,TH,FR', '08', '30');
            window.open(url, '_blank');
        });
    }
}

async function shareToKeep(practicedWords) {
    if (!practicedWords || practicedWords.length === 0) {
        alert("Geen woorden geoefend vandaag!");
        return;
    }

    const today = new Date().toLocaleDateString('nl-NL');
    
    let shareText = `Voicabulary Les - ${today}\n\n`;
    practicedWords.forEach(w => {
        shareText += `- ${w.eng} = ${w.nl}\n`;
    });
    
    // Web Share API works well on mobile, but fails on Desktop.
    // As a fallback for desktop, we can use a direct link to Keep.
    const keepUrl = `https://keep.google.com/#NOTE/title=${encodeURIComponent(`Voicabulary - ${today}`)}&text=${encodeURIComponent(shareText)}`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: `Voicabulary - ${today}`,
                text: shareText
            });
        } catch (err) {
            console.error('Error sharing, falling back to Keep URL:', err);
            window.open(keepUrl, '_blank');
        }
    } else {
        // Fallback for desktop browsers
        window.open(keepUrl, '_blank');
    }
}
