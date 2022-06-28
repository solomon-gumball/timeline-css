export type WebTokenPayload = { id: string, username: string }

export declare namespace API {
  export type User = {
    created_at: string,
    id: string,
    username: string,
    email?: string,
    github_id: number,
    photo?: string,
  }

  export type Star = {
    created_at: string,
    project_id?: string,
  }

  export type Project = {
    created_at: string,
    updated_at: string,
    id: string,
    preview_offset_time: number,
    preview_infinite: boolean,
    user_id: string,
    source: { css: string, html: string },
    name: string,
  }

  export type UserProjectJoin = API.User & API.Project & { star_count: string }
}

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>

export {}
