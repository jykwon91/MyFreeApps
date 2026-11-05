"""Sample inquiries and applicants for demo accounts. All made up: example.com and 555 numbers."""

DEMO_INQUIRIES: list[dict] = [
    {
        "days_ago": 1,
        "stage": "new",
        "inquirer_name": "Maya Chen",
        "inquirer_email": "maya.chen@example.com",
        "inquirer_phone": "(615) 555-0142",
        "inquirer_employer": "Riverside Medical Center",
        "stay_starts_in_days": 30,
        "stay_days": 90,
        "message": (
            "Hi, I'm a travel nurse starting a 13-week contract next month. "
            "Is the Downtown Loft available, and is parking included?"
        ),
    },
    {
        "days_ago": 3,
        "stage": "replied",
        "inquirer_name": "Daniel Ortiz",
        "inquirer_email": "daniel.ortiz@example.com",
        "inquirer_phone": "(615) 555-0178",
        "inquirer_employer": "Ortiz Consulting",
        "stay_starts_in_days": 45,
        "stay_days": 180,
        "message": "Looking for a six-month rental for my family of three. Do you allow a small dog?",
    },
    {
        "days_ago": 6,
        "stage": "screening_requested",
        "inquirer_name": "Priya Nair",
        "inquirer_email": "priya.nair@example.com",
        "inquirer_phone": "(615) 555-0119",
        "inquirer_employer": "Lakeside University",
        "stay_starts_in_days": 21,
        "stay_days": 365,
        "message": "I'd love to rent Sunset Villa for a year starting next month. What do you need from me?",
        "applicant_stage": "screening_pending",
    },
]
