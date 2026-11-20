
CREATE TABLE movies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL UNIQUE,
    release_year INTEGER NOT NULL,
    runtime_minutes INTEGER NOT NULL
        CHECK (runtime_minutes BETWEEN 1 AND 300),
    watched BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE movie_prerequisites (
    movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    prerequisite_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    PRIMARY KEY (movie_id, prerequisite_id),
    CHECK (movie_id <> prerequisite_id)
);

CREATE TABLE cinemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cinema_bundle_sizes (
    cinema_id UUID NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
    bundle_size INTEGER NOT NULL CHECK (bundle_size BETWEEN 1 AND 500),
    PRIMARY KEY (cinema_id, bundle_size)
);
