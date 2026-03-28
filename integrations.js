/**
 * Integrations for Voicabulary
 * Handles Calendar Links and Web Share API
 */

function generateCalendarLink(days, hour, minute) {
    const title = encodeURIComponent("Voicabulary Lesson");
    const details = encodeURIComponent("Time for your daily English practice! Open your Voicabulary app.");
    
    // Create base date for tomorrow to avoid immediate past events
    const now = new Date();
    now.setDate(now.getDate() + 1);
    
    // We use a clean local string approach to avoid timezone offsets completely breaking the recurrence
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    // For generic weekly events, we just give it local time without the 'Z'.
    // E.g. 20231015T073000
    const startTimeStr = `${year}${month}${day}T${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}00`;
    
    // Calculate end time (+30 mins)
    let endHour = parseInt(hour, 10);
    let endMin = parseInt(minute, 10) + 30;
    if (endMin >= 60) {
        endHour++;
        endMin -= 60;
    }
    const endTimeStr = `${year}${month}${day}T${String(endHour).padStart(2, '0')}${String(endMin).padStart(2, '0')}00`;

    // Action template for Google Calendar
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${startTimeStr}/${endTimeStr}&recur=RRULE:FREQ=WEEKLY;BYDAY=${days}`;
}

function downloadICSFile(days, hour, minute) {
    const title = "Voicabulary Lesson";
    const details = "Time for your daily English practice! Open your Voicabulary app.";
    
    // Create base date for tomorrow
    const now = new Date();
    now.setDate(now.getDate() + 1);
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    // Floating local time format for ICS (e.g. 20231015T073000)
    const startTimeStr = `${year}${month}${day}T${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}00`;
    
    let endHour = parseInt(hour, 10);
    let endMin = parseInt(minute, 10) + 30;
    if (endMin >= 60) {
        endHour++;
        endMin -= 60;
    }
    const endTimeStr = `${year}${month}${day}T${String(endHour).padStart(2, '0')}${String(endMin).padStart(2, '0')}00`;

    const icsContent = 
`BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
BEGIN:VEVENT
SUMMARY:${title}
DESCRIPTION:${details}
DTSTART:${startTimeStr}
DTEND:${endTimeStr}
RRULE:FREQ=WEEKLY;BYDAY=${days}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Voicabulary_${days}.ics`);
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

function setupCalendarButtons() {
    const btnMonWed = document.getElementById('cal-mon-wed');
    const btnTueThuFri = document.getElementById('cal-tue-thu-fri');
    
    function handleCalendarClick(days, hour, minute) {
        // If the user seems to be on a mobile device, we offer a native .ics download
        // because native mobile calendar apps intercept .ics files perfectly, 
        // whereas they often fail to parse the web URLs.
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            downloadICSFile(days, hour, minute);
            alert("Er is een agenda-bestand gedownload! Open deze om hem rechtstreeks in je kalender app te zetten.");
            return;
        }

        try {
            const url = generateCalendarLink(days, hour, minute);
            console.log("Generated Calendar URL:", url);
            
            // Try opening in new tab
            const newWindow = window.open(url, '_blank');
            
            // If popup blocked or failed
            if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
                alert("Pop-up geblokkeerd! \nWe proberen je nu direct door te sturen via ditzelfde tabblad.");
                window.location.href = url;
            }
        } catch (error) {
            console.error("Error generating calendar link:", error);
            alert("Er ging iets mis met het genereren van de kalender link. " + error.message);
        }
    }

    if (btnMonWed) {
        btnMonWed.addEventListener('click', () => handleCalendarClick('MO,WE', '07', '30'));
    }
    
    if (btnTueThuFri) {
        btnTueThuFri.addEventListener('click', () => handleCalendarClick('TU,TH,FR', '08', '30'));
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
